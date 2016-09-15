import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import * as base from './base';
import {Set, TranspilerBase} from './base';

import mkdirP from './mkdirp';
import DeclarationTranspiler from './declaration';
import * as merge from './merge';
import ModuleTranspiler from './module';
import TypeTranspiler from './type';
import {FacadeConverter, NameRewriter} from './facade_converter';
import * as dartStyle from 'dart-style';

export interface TranspilerOptions {
  /**
   * Fail on the first error, do not collect multiple. Allows easier debugging as stack traces lead
   * directly to the offending line.
   */
  failFast?: boolean;
  /** Whether to generate 'library a.b.c;' names from relative file paths. */
  generateLibraryName?: boolean;
  /**
   * A base path to relativize absolute file paths against. This is useful for library name
   * generation (see above) and nicer file names in error messages.
   */
  basePath?: string;
  /**
   * Use dart:html instead of the raw JavaScript DOM when generated Dart code.
   */
  useHtml?: boolean;
  /**
   * Enforce conventions of public/private keyword and underscore prefix
   */
  enforceUnderscoreConventions?: boolean;
  /**
   * Sets a root path to look for typings used by the facade converter.
   */
  typingsRoot?: string;

  /**
   * Experimental JS Interop specific option to promote properties with function
   * types to methods instead of properties with a function type. This the makes
   * the Dart code more readable at the cost of disallowing setting the value of
   * the property.
   * Example JS library that benifits from this option:
   * https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/chartjs/chart.d.ts
   */
  promoteFunctionLikeMembers?: boolean;
}

export const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowNonTsExtensions: true,
  experimentalDecorators: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES5,
};

/**
 * Context to ouput code into.
 */
export enum OutputContext {
  Import = 0,
  Header = 1,
  Default = 2,
}

const NUM_OUTPUT_CONTEXTS = 3;

export class Transpiler {
  private outputs: Output[];
  private outputStack: Output[];
  private currentFile: ts.SourceFile;
  importsEmitted: Set;
  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  private lastCommentIdx: number = -1;
  private errors: string[] = [];

  private transpilers: TranspilerBase[];
  private declarationTranspiler: DeclarationTranspiler;
  private fc: FacadeConverter;
  private nameRewriter: NameRewriter;

  constructor(private options: TranspilerOptions = {}) {
    this.nameRewriter = new NameRewriter();
    this.fc = new FacadeConverter(this, options.typingsRoot, this.nameRewriter, options.useHtml);
    this.declarationTranspiler = new DeclarationTranspiler(
        this, this.fc, options.enforceUnderscoreConventions, options.promoteFunctionLikeMembers);
    this.transpilers = [
      this.declarationTranspiler,
      new ModuleTranspiler(this, this.fc, options.generateLibraryName),
      new TypeTranspiler(this, this.fc),
    ];
  }

  /**
   * Transpiles the given files to Dart.
   * @param fileNames The input files.
   * @param destination Location to write files to. Creates files next to their sources if absent.
   */
  transpile(fileNames: string[], destination?: string): void {
    if (this.options.basePath) {
      this.options.basePath = this.normalizeSlashes(path.resolve(this.options.basePath));
    }
    fileNames = fileNames.map((f) => this.normalizeSlashes(f));
    let host = this.createCompilerHost();
    if (this.options.basePath && destination === undefined) {
      throw new Error(
          'Must have a destination path when a basePath is specified ' + this.options.basePath);
    }
    let destinationRoot = destination || this.options.basePath || '';
    let program = ts.createProgram(fileNames, this.getCompilerOptions(), host);
    this.fc.setTypeChecker(program.getTypeChecker());
    this.declarationTranspiler.setTypeChecker(program.getTypeChecker());

    // Only write files that were explicitly passed in.
    let fileSet: {[s: string]: boolean} = {};
    fileNames.forEach((f) => fileSet[f] = true);
    let sourceFiles = program.getSourceFiles().filter((sourceFile) => fileSet[sourceFile.fileName]);

    this.errors = [];

    sourceFiles.forEach((f: ts.SourceFile) => {
      let dartCode = this.translate(f);
      let outputFile = this.getOutputPath(path.resolve(f.fileName), destinationRoot);
      mkdirP(path.dirname(outputFile));
      fs.writeFileSync(outputFile, dartCode);
    });
    this.checkForErrors(program);
  }

  translateProgram(program: ts.Program): {[path: string]: string} {
    this.fc.setTypeChecker(program.getTypeChecker());
    this.declarationTranspiler.setTypeChecker(program.getTypeChecker());

    let paths: {[path: string]: string} = {};
    this.errors = [];
    program.getSourceFiles()
        .filter(
            (sourceFile: ts.SourceFile) =>
                (!sourceFile.fileName.match(/\.d\.ts$/) && !!sourceFile.fileName.match(/\.[jt]s$/)))
        .forEach((f) => paths[f.fileName] = this.translate(f));
    this.checkForErrors(program);
    return paths;
  }

  private getCompilerOptions() {
    let opts: ts.CompilerOptions = {};
    for (let k of Object.keys(COMPILER_OPTIONS)) opts[k] = COMPILER_OPTIONS[k];
    opts.rootDir = this.options.basePath;
    return opts;
  }

  private createCompilerHost(): ts.CompilerHost {
    let defaultLibFileName = ts.getDefaultLibFileName(COMPILER_OPTIONS);
    defaultLibFileName = this.normalizeSlashes(defaultLibFileName);
    let compilerHost: ts.CompilerHost = {
      getSourceFile: (sourceName, languageVersion) => {
        let sourcePath = sourceName;
        if (sourceName === defaultLibFileName) {
          sourcePath = ts.getDefaultLibFilePath(COMPILER_OPTIONS);
        }
        if (!fs.existsSync(sourcePath)) return undefined;
        let contents = fs.readFileSync(sourcePath, 'UTF-8');
        return ts.createSourceFile(sourceName, contents, COMPILER_OPTIONS.target, true);
      },
      writeFile(name, text, writeByteOrderMark) { fs.writeFile(name, text); },
      fileExists: (filename) => fs.existsSync(filename),
      readFile: (filename) => fs.readFileSync(filename, 'utf-8'),
      getDefaultLibFileName: () => defaultLibFileName,
      useCaseSensitiveFileNames: () => true,
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => '',
      getNewLine: () => '\n',
    };
    compilerHost.resolveModuleNames = getModuleResolver(compilerHost);
    return compilerHost;
  }

  // Visible for testing.
  getOutputPath(filePath: string, destinationRoot: string): string {
    let relative = this.getRelativeFileName(filePath);
    let dartFile = relative.replace(/.(js|es6|d\.ts|ts)$/, '.dart');
    return this.normalizeSlashes(path.join(destinationRoot, dartFile));
  }

  public pushContext(context: OutputContext) { this.outputStack.push(this.outputs[context]); }

  public popContext() {
    if (this.outputStack.length === 0) {
      this.reportError(null, 'Attempting to pop output stack when already empty');
    }
    this.outputStack.pop();
  }

  private translate(sourceFile: ts.SourceFile): string {
    this.currentFile = sourceFile;
    this.outputs = [];
    this.outputStack = [];
    this.importsEmitted = {};
    for (let i = 0; i < NUM_OUTPUT_CONTEXTS; ++i) {
      this.outputs.push(new Output());
    }

    this.lastCommentIdx = -1;
    merge.normalizeSourceFile(sourceFile);
    this.pushContext(OutputContext.Default);
    this.visit(sourceFile);
    this.popContext();
    if (this.outputStack.length > 0) {
      this.reportError(
          sourceFile, 'Internal error managing output contexts. ' +
              'Inconsistent push and pop context calls.');
    }
    let result = '';
    for (let output of this.outputs) {
      result += output.getResult();
    }
    return this.formatCode(result, sourceFile);
  }

  private formatCode(code: string, context: ts.Node) {
    let result = dartStyle.formatCode(code);
    if (result.error) {
      this.reportError(context, result.error);
      return code;
    }
    return result.code;
  }

  private checkForErrors(program: ts.Program) {
    let errors = this.errors;

    let diagnostics = program.getGlobalDiagnostics().concat(program.getSyntacticDiagnostics());

    if ((errors.length || diagnostics.length)) {
      // Only report semantic diagnostics if facade generation failed; this
      // code is not a generic compiler, so only yields TS errors if they could
      // be the cause of facade generation issues.
      // This greatly speeds up tests and execution.
      diagnostics = diagnostics.concat(program.getSemanticDiagnostics());
    }

    let diagnosticErrs = diagnostics.map((d) => {
      let msg = '';
      if (d.file) {
        let pos = d.file.getLineAndCharacterOfPosition(d.start);
        let fn = this.getRelativeFileName(d.file.fileName);
        msg += ` ${fn}:${pos.line + 1}:${pos.character + 1}`;
      }
      msg += ': ';
      msg += ts.flattenDiagnosticMessageText(d.messageText, '\n');
      return msg;
    });
    if (diagnosticErrs.length) errors = errors.concat(diagnosticErrs);

    if (errors.length) {
      let e = new Error(errors.join('\n'));
      e.name = 'DartFacadeError';
      throw e;
    }
  }

  /**
   * Returns `filePath`, relativized to the program's `basePath`.
   * @param filePath Optional path to relativize, defaults to the current file's path.
   */
  getRelativeFileName(filePath?: string) {
    if (filePath === undefined) filePath = path.resolve(this.currentFile.fileName);
    // TODO(martinprobst): Use path.isAbsolute on node v0.12.
    if (this.normalizeSlashes(path.resolve('/x/', filePath)) !== filePath) {
      return filePath;  // already relative.
    }
    let base = this.options.basePath || '';
    if (filePath.indexOf(base) !== 0 && !filePath.match(/\.d\.ts$/)) {
      throw new Error(`Files must be located under base, got ${filePath} vs ${base}`);
    }
    return this.normalizeSlashes(path.relative(base, filePath));
  }

  private get currentOutput(): Output { return this.outputStack[this.outputStack.length - 1]; }

  emit(s: string) { this.currentOutput.emit(s); }
  emitNoSpace(s: string) { this.currentOutput.emitNoSpace(s); }
  maybeLineBreak() { return this.currentOutput.maybeLineBreak(); }
  enterCodeComment() { return this.currentOutput.enterCodeComment(); }
  exitCodeComment() { return this.currentOutput.exitCodeComment(); }
  emitType(s: string, comment: string) { return this.currentOutput.emitType(s, comment); }
  get insideCodeComment() { return this.currentOutput.insideCodeComment; }

  reportError(n: ts.Node, message: string) {
    let file = n.getSourceFile() || this.currentFile;
    let fileName = this.getRelativeFileName(file.fileName);
    let start = n.getStart(file);
    let pos = file.getLineAndCharacterOfPosition(start);
    // Line and character are 0-based.
    let fullMessage = `${fileName}:${pos.line + 1}:${pos.character + 1}: ${message}`;
    if (this.options.failFast) throw new Error(fullMessage);
    this.errors.push(fullMessage);
  }

  visit(node: ts.Node) {
    if (!node) return;
    let comments = ts.getLeadingCommentRanges(this.currentFile.text, node.getFullStart());
    if (comments) {
      comments.forEach((c) => {
        // Warning: the following check means that comments will only be
        // emitted correctly if Dart code is emitted in the same order it
        // appeared in the JavaScript AST.
        if (c.pos <= this.lastCommentIdx) return;
        this.lastCommentIdx = c.pos;
        let text = this.currentFile.text.substring(c.pos, c.end);
        if (c.pos > 1) {
          let prev = this.currentFile.text.substring(c.pos - 2, c.pos);
          if (prev === '\n\n') {
            // If the two previous characters are both \n then add a \n
            // so that we ensure the output has sufficient line breaks to
            // separate comment blocks.
            this.currentOutput.emit('\n');
          }
        }
        this.currentOutput.emitComment(this.translateComment(text));
      });
    }

    for (let i = 0; i < this.transpilers.length; i++) {
      if (this.transpilers[i].visitNode(node)) return;
    }

    this.reportError(
        node,
        'Unsupported node type ' + (<any>ts).SyntaxKind[node.kind] + ': ' + node.getFullText());
  }

  private normalizeSlashes(path: string) { return path.replace(/\\/g, '/'); }

  private translateComment(comment: string): string {
    let rawComment = comment;
    comment = comment.replace(/\{@link ([^\}]+)\}/g, '[$1]');

    // Remove the following tags and following comments till end of line.
    comment = comment.replace(/@param.*$/gm, '');
    comment = comment.replace(/@throws.*$/gm, '');
    comment = comment.replace(/@return.*$/gm, '');

    // Remove the following tags.
    comment = comment.replace(/@module/g, '');
    comment = comment.replace(/@description/g, '');
    comment = comment.replace(/@deprecated/g, '');

    // Switch to /* */ comments and // comments to ///
    let sb = '';
    for (let line of comment.split('\n')) {
      line = line.trim();
      line = line.replace(/^[\/]\*\*?/g, '');
      line = line.replace(/\*[\/]$/g, '');
      line = line.replace(/^\*/g, '');
      line = line.replace(/^\/\/\/?/g, '');
      line = line.trim();
      if (line.length > 0) {
        sb += ' /// ' + line + '\n';
      }
    }
    if (rawComment[0] === '\n') sb = '\n' + sb;
    return sb;
  }
}

export function getModuleResolver(compilerHost: ts.CompilerHost) {
  return (moduleNames: string[], containingFile: string): ts.ResolvedModule[] => {
    let res: ts.ResolvedModule[] = [];
    for (let mod of moduleNames) {
      let lookupRes =
          ts.nodeModuleNameResolver(mod, containingFile, COMPILER_OPTIONS, compilerHost);
      if (lookupRes.resolvedModule) {
        res.push(lookupRes.resolvedModule);
        continue;
      }
      lookupRes = ts.classicNameResolver(mod, containingFile, COMPILER_OPTIONS, compilerHost);
      if (lookupRes.resolvedModule) {
        res.push(lookupRes.resolvedModule);
        continue;
      }
      res.push(undefined);
    }
    return res;
  };
}

class Output {
  private result: string = '';
  private firstColumn: boolean = true;

  insideCodeComment: boolean = false;
  private codeCommentResult: string = '';

  /**
   * Line break if the current line is not empty.
   */
  maybeLineBreak() {
    if (this.insideCodeComment) {
      // Avoid line breaks inside code comments.
      return;
    }

    if (!this.firstColumn) {
      this.emitNoSpace('\n');
    }
  }

  emit(str: string) {
    if (this.result.length > 0) {
      let buffer = this.insideCodeComment ? this.codeCommentResult : this.result;
      let lastChar = buffer[buffer.length - 1];
      if (lastChar !== ' ' && lastChar !== '(' && lastChar !== '<' && lastChar !== '[') {
        // Avoid emitting a space in obvious cases where a space is not required
        // to make the output slightly prettier in cases where the DartFormatter
        // cannot run such as within a comment where code we emit is not quite
        // valid Dart code.
        this.emitNoSpace(' ');
      }
    }
    this.emitNoSpace(str);
  }

  emitNoSpace(str: string) {
    if (str.length === 0) return;
    if (this.insideCodeComment) {
      this.codeCommentResult += str;
      return;
    }
    this.result += str;
    this.firstColumn = str[str.length - 1] === '\n';
  }

  enterCodeComment() {
    if (this.insideCodeComment) {
      throw 'Cannot nest code comments' + this.codeCommentResult;
    }
    this.insideCodeComment = true;
    this.codeCommentResult = '';
  }

  emitType(s: string, comment: string) {
    this.emit(base.formatType(s, comment, this.insideCodeComment));
  }

  /**
   * Always emit comments in the main program body outside of the existing code
   * comment block.
   */
  emitComment(s: string) {
    if (!this.firstColumn) {
      this.result += '\n';
    }
    this.result += s;
    this.firstColumn = true;
  }

  exitCodeComment() {
    if (!this.insideCodeComment) {
      throw 'Exit code comment called while not within a code comment.';
    }
    this.insideCodeComment = false;
    this.emitNoSpace(' /*');
    let result = dartStyle.formatCode(this.codeCommentResult);
    let code = this.codeCommentResult;
    if (!result.error) {
      code = result.code;
    }
    code = code.trim();
    this.emitNoSpace(code);
    this.emitNoSpace('*/');

    // Don't really need an exact column, just need to track
    // that we aren't on the first column.
    this.firstColumn = false;
    this.codeCommentResult = '';
  }

  getResult(): string {
    if (this.insideCodeComment) {
      throw 'Code comment not property terminated.';
    }
    return this.result;
  }
}

// CLI entry point
if (require.main === module) {
  let args = require('minimist')(process.argv.slice(2), {base: 'string'});
  try {
    let transpiler = new Transpiler(args);
    console.error('Transpiling', args._, 'to', args.destination);
    transpiler.transpile(args._, args.destination);
  } catch (e) {
    if (e.name !== 'DartFacadeError') throw e;
    console.error(e.message);
    process.exit(1);
  }
}
