import * as dartStyle from 'dart-style';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import * as base from './base';
import {ImportSummary, TranspilerBase} from './base';
import DeclarationTranspiler from './declaration';
import {FacadeConverter} from './facade_converter';
import {convertAST} from './json/conversions';
import {ConvertedSyntaxKind} from './json/converted_syntax_kinds';
import * as merge from './merge';
import mkdirP from './mkdirp';
import ModuleTranspiler from './module';
import TypeTranspiler from './type';

export interface TranspilerOptions {
  /**
   * Fail on the first error, do not collect multiple. Allows easier debugging as stack traces lead
   * directly to the offending line.
   */
  failFast?: boolean;
  /**
   * Output TypeScript semantic diagnostics when facade generation fails and TS errors could be the
   * reason for the failure. When falsey, semantic diagnostics will never be output.
   */
  semanticDiagnostics?: boolean;
  /**
   * Skip running dart-format on the output. This is useful for large files (like dom.d.ts) since
   * the node package version of dart-format is significantly slower than the version in the SDK.
   */
  skipFormatting?: boolean;
  /**
   * Specify the module name (e.g.) d3 instead of determining the module name from the d.ts files.
   * This is useful for libraries that assume they will be loaded with a JS module loader but that
   * Dart needs to load without a module loader until Dart supports JS module loaders.
   */
  moduleName?: string;
  /**
   * A base path to relativize absolute file paths against. This is useful for library name
   * generation (see above) and nicer file names in error messages.
   */
  basePath?: string;
  /**
   * Enforce conventions of public/private keyword and underscore prefix
   */
  enforceUnderscoreConventions?: boolean;
  /**
   * Sets a root path to look for typings used by the facade converter.
   */
  typingsRoot?: string;
  /**
   * Generate browser API facades instead of importing them from dart:html.
   */
  generateHTML?: boolean;
  /**
   * Rename types to avoid conflicts in cases where a variable and a type have the exact same name,
   * but it is not clear if they are related or not.
   */
  renameConflictingTypes?: boolean;
  /**
   * Do not assume that all properties declared on the anonymous types of top level variable
   * declarations are static.
   */
  explicitStatic?: boolean;
  /**
   * Emit anonymous tags on all classes that have neither constructors nor static members.
   */
  trustJSTypes?: boolean;
  /**
   * Experimental option to emit the source file ASTs as JSON after performing preliminary
   * processing that makes the format compatible with Dart.
   */
  toJSON?: boolean;
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
  experimentalDecorators: true,
  module: ts.ModuleKind.ES2015,
  // ES2015 is targeted rather than a later version of ES because we don't require any features
  // introduced after ES2015
  target: ts.ScriptTarget.ES2015,
};

/**
 * Context to ouput code into.
 */
export const enum OutputContext {
  Import = 0,
  Header = 1,
  Default = 2,
}

const NUM_OUTPUT_CONTEXTS = 3;

export class Transpiler {
  private outputs: Output[];
  private outputStack: Output[];
  private currentFile: ts.SourceFile;
  /**
   * Map of import library path to a Set of identifier names being imported.
   */
  imports: Map<String, ImportSummary>;
  /**
   * Map containing AST nodes that we have removed or replaced. This is safer than modifying the AST
   * directly.
   */
  nodeSubstitutions: Map<ts.Node, ts.Node> = new Map();
  // Comments attach to all following AST nodes before the next 'physical' token. Track the earliest
  // offset to avoid printing comments multiple times.
  private lastCommentIdx = -1;
  private errors: string[] = [];

  private transpilers: TranspilerBase[];
  private declarationTranspiler: DeclarationTranspiler;
  private fc: FacadeConverter;
  /* Number of nested levels of type arguments the current expression is within. */
  private typeArgumentDepth = 0;

  constructor(private options: TranspilerOptions = {}) {
    this.fc = new FacadeConverter(this, options.typingsRoot, options.generateHTML);
    this.declarationTranspiler = new DeclarationTranspiler(
        this, this.fc, options.enforceUnderscoreConventions, options.promoteFunctionLikeMembers,
        options.trustJSTypes);
    this.transpilers = [
      new ModuleTranspiler(this, this.fc, options.moduleName),
      this.declarationTranspiler,
      new TypeTranspiler(this, this.fc),
    ];
  }

  /**
   * Transpiles the given files to Dart.
   * @param fileNames The input files.
   * @param destination Location to write files to. Outputs file contents to stdout if absent.
   */
  transpile(fileNames: string[], destination?: string): void {
    this.errors = [];

    if (this.options.basePath) {
      this.options.basePath = this.normalizeSlashes(path.resolve(this.options.basePath));
    }
    fileNames = fileNames.map((name: string) => {
      const normalizedName = this.normalizeSlashes(name);
      if (normalizedName.startsWith('./')) {
        // The fileName property of SourceFiles omits ./ for files in the current directory
        return normalizedName.substring(2);
      }
      return normalizedName;
    });
    // Only write files that were explicitly passed in.
    const fileSet = new Set(fileNames);

    const sourceFileMap: Map<string, ts.SourceFile> = new Map();
    const host = this.createCompilerHost(sourceFileMap);

    this.normalizeSourceFiles(fileSet, sourceFileMap, host);
    // Create a new program after performing source file transformations.
    const normalizedProgram = ts.createProgram(fileNames, this.getCompilerOptions(), host);
    const translatedResults = this.translateProgram(normalizedProgram, fileNames);

    for (const fileName of translatedResults.keys()) {
      if (destination) {
        const outputFile = this.getOutputPath(path.resolve(fileName), destination);
        console.log('Output file:', outputFile);
        mkdirP(path.dirname(outputFile));
        fs.writeFileSync(outputFile, translatedResults.get(fileName));
      } else {
        // Write source code directly to the console when no destination is specified.
        console.log(translatedResults.get(fileName));
      }
    }
    this.checkForErrors(normalizedProgram);
  }

  translateProgram(program: ts.Program, entryPoints: string[]): Map<string, string> {
    this.fc.setTypeChecker(program.getTypeChecker());
    this.declarationTranspiler.setTypeChecker(program.getTypeChecker());

    const paths: Map<string, string> = new Map();
    this.errors = [];
    program.getSourceFiles()
        .filter((f: ts.SourceFile) => entryPoints.includes(f.fileName))
        .forEach((f) => {
          if (this.options.toJSON) {
            paths.set(f.fileName, this.convertToJSON(f));
          } else {
            paths.set(f.fileName, this.translate(f));
          }
        });
    this.checkForErrors(program);

    if (this.options.toJSON) {
      paths.set('converted_syntax_kinds.ts', JSON.stringify(ConvertedSyntaxKind, undefined, 2));
    }
    return paths;
  }

  /**
   * Preliminary processing of source files to make them compatible with Dart.
   *
   * Propagates namespace export declarations and merges related classes and variables.
   *
   * @param fileNames The input files.
   * @param sourceFileMap A map that is used to access SourceFiles by their file names. The
   *     normalized files will be stored in this map.
   * @param compilerHost The TS compiler host.
   */
  normalizeSourceFiles(
      fileNames: Set<string>, sourceFileMap: Map<string, ts.SourceFile>,
      compilerHost: ts.CompilerHost) {
    const program =
        ts.createProgram(Array.from(fileNames), this.getCompilerOptions(), compilerHost);

    if (program.getSyntacticDiagnostics().length > 0) {
      // Throw first error.
      const first = program.getSyntacticDiagnostics()[0];
      const error = new Error(`${first.start}: ${first.messageText} in ${first.file.fileName}`);
      error.name = 'DartFacadeError';
      throw error;
    }

    this.fc.setTypeChecker(program.getTypeChecker());

    const sourceFiles =
        program.getSourceFiles().filter((f: ts.SourceFile) => fileNames.has(f.fileName));

    sourceFiles.forEach((f: ts.SourceFile) => {
      sourceFileMap.set(f.fileName, f);
    });

    sourceFiles.forEach((f: ts.SourceFile) => {
      this.propagateNamespaceExportDeclarations(f, sourceFileMap, compilerHost);
    });

    sourceFiles.forEach((f: ts.SourceFile) => {
      const normalizedFile = merge.normalizeSourceFile(
          f, this.fc, fileNames, this.options.renameConflictingTypes, this.options.explicitStatic);

      sourceFileMap.set(f.fileName, normalizedFile);
    });
  }

  /**
   * Check for namespace export declarations and propagate them to all modules they export.
   *
   * Namespace export declarations are used to declare UMD modules. The syntax for
   * them is 'export as namespace MyNamespace;'. This means that exported members of module
   * MyNamespace can be accessed through the global variable 'MyNamespace' within script files. Or
   * within source files, by importing them like you would import other modular libraries.
   */
  private propagateNamespaceExportDeclarations(
      sourceFile: ts.SourceFile,
      sourceFileMap: Map<string, ts.SourceFile>,
      compilerHost: ts.CompilerHost,
  ) {
    let globalModuleName: string;
    sourceFile.forEachChild((n: ts.Node) => {
      if (!ts.isNamespaceExportDeclaration(n)) return;
      // This is the name we are interested in for Dart purposes until Dart supports AMD module
      // loaders. This module name should all be reflected by all modules exported by this
      // library as we need to specify a global module location for every Dart library.
      globalModuleName = base.ident(n.name);
      sourceFile.moduleName = globalModuleName;
    });

    const missingFiles: string[] = [];
    sourceFile.statements.forEach((e: ts.Node) => {
      if (!ts.isExportDeclaration(e)) return;
      let exportDecl = e;
      if (!exportDecl.moduleSpecifier) return;
      let moduleLocation = <ts.StringLiteral>exportDecl.moduleSpecifier;
      let location = moduleLocation.text;
      let resolvedPath = compilerHost.resolveModuleNames(
          [location], sourceFile.fileName, undefined, undefined, this.getCompilerOptions());
      resolvedPath.forEach((p) => {
        if (!p || p.isExternalLibraryImport) return;
        const exportedFile = sourceFileMap.get(p.resolvedFileName);
        if (exportedFile) {
          exportedFile.moduleName = globalModuleName;
        } else {
          missingFiles.push(p.resolvedFileName);
        }
      });
    });
    if (missingFiles.length) {
      const error = new Error();
      error.message =
          'The following files were referenced but were not supplied as a command line arguments. Reference the README for usage instructions.';
      for (const file of missingFiles) {
        error.message += '\n';
        error.message += file;
      }
      error.name = 'DartFacadeError';
      throw error;
    }
  }

  getCompilerOptions() {
    const opts: ts.CompilerOptions = Object.assign({}, COMPILER_OPTIONS);
    opts.rootDir = this.options.basePath;
    if (this.options.generateHTML) {
      // Prevent the TypeScript DOM library files from being compiled.
      opts.lib = ['lib.es2015.d.ts', 'lib.scripthost.d.ts'];
    }
    return opts;
  }

  private createCompilerHost(sourceFileMap: Map<string, ts.SourceFile>): ts.CompilerHost {
    const compilerOptions = this.getCompilerOptions();
    const compilerHost = ts.createCompilerHost(compilerOptions);
    const defaultLibFileName = this.normalizeSlashes(ts.getDefaultLibFileName(compilerOptions));
    compilerHost.getSourceFile = (sourceName) => {
      let sourcePath = sourceName;
      if (sourceName === defaultLibFileName) {
        sourcePath = ts.getDefaultLibFilePath(compilerOptions);
      } else if (sourceFileMap.has(sourceName)) {
        return sourceFileMap.get(sourceName);
      }
      if (!fs.existsSync(sourcePath)) {
        return undefined;
      }
      const contents = fs.readFileSync(sourcePath, 'utf-8');
      return ts.createSourceFile(sourceName, contents, COMPILER_OPTIONS.target, true);
    };
    compilerHost.writeFile = (name, text, writeByteOrderMark) => {
      fs.writeFile(name, text, undefined);
    };
    compilerHost.useCaseSensitiveFileNames = () => true;
    compilerHost.getCurrentDirectory = () => '';
    compilerHost.getNewLine = () => '\n';
    compilerHost.resolveModuleNames = getModuleResolver(compilerHost);

    return compilerHost;
  }

  // Visible for testing.
  getOutputPath(filePath: string, destinationRoot: string): string {
    let relative: string;
    if (this.options.toJSON) {
      relative = this.getJSONFileName(filePath);
    } else {
      relative = this.getDartFileName(filePath);
    }
    return this.normalizeSlashes(path.join(destinationRoot, relative));
  }

  public pushContext(context: OutputContext) {
    this.outputStack.push(this.outputs[context]);
  }

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
    this.imports = new Map();
    for (let i = 0; i < NUM_OUTPUT_CONTEXTS; ++i) {
      this.outputs.push(new Output());
    }

    this.lastCommentIdx = -1;
    this.pushContext(OutputContext.Default);
    this.visit(sourceFile);
    this.popContext();
    if (this.outputStack.length > 0) {
      this.reportError(
          sourceFile,
          'Internal error managing output contexts. ' +
              'Inconsistent push and pop context calls.');
    }
    this.pushContext(OutputContext.Import);

    this.imports.forEach((summary, name) => {
      this.emit(`import ${JSON.stringify(name)}`);

      if (!summary.showAll) {
        let shownNames = Array.from(summary.shown);
        if (shownNames.length > 0) {
          this.emit(`show ${shownNames.join(', ')}`);
        }
      }
      if (summary.asPrefix) {
        this.emit(`as ${summary.asPrefix}`);
      }
      this.emit(';\n');
    });
    this.popContext();

    let result = '';
    for (let output of this.outputs) {
      result += output.getResult();
    }

    if (this.options.skipFormatting) {
      return result;
    }
    return this.formatCode(result, sourceFile);
  }

  private convertToJSON(sourceFile: ts.SourceFile): string {
    const converted = convertAST(sourceFile);
    return JSON.stringify(converted, undefined, 2);
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

      if (this.options.semanticDiagnostics) {
        diagnostics = diagnostics.concat(program.getSemanticDiagnostics());
      }
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
      const e = new Error(errors.join('\n'));
      e.name = 'DartFacadeError';
      throw e;
    }
  }

  /**
   * Returns `filePath`, relativized to the program's `basePath`.
   * @param filePath Optional path to relativize, defaults to the current file's path.
   */
  getRelativeFileName(filePath?: string): string {
    if (filePath === undefined) {
      filePath = path.resolve(this.currentFile.fileName);
    }
    if (!path.isAbsolute(filePath)) {
      return filePath;  // already relative.
    }
    const basePath = this.options.basePath || '';
    if (filePath.indexOf(basePath) !== 0 && !filePath.match(/\.d\.ts$/)) {
      throw new Error(`Files must be located under base, got ${filePath} vs ${basePath}`);
    }
    return this.normalizeSlashes(path.relative(basePath, filePath));
  }

  getDartFileName(filePath?: string): string {
    if (filePath === undefined) {
      filePath = path.resolve(this.currentFile.fileName);
    }
    filePath = this.normalizeSlashes(filePath);
    filePath = filePath.replace(/\.(js|es6|d\.ts|ts)$/, '.dart');
    // Normalize from node module file path pattern to
    filePath = filePath.replace(/([^/]+)\/index.dart$/, '$1.dart');
    return this.getRelativeFileName(filePath);
  }

  getJSONFileName(filePath?: string): string {
    if (filePath === undefined) {
      filePath = path.resolve(this.currentFile.fileName);
    }
    filePath = this.normalizeSlashes(filePath);
    filePath = filePath.replace(/\.(js|es6|d\.ts|ts)$/, '.json');
    // Normalize from node module file path pattern to
    filePath = filePath.replace(/([^/]+)\/index.dart$/, '$1.json');
    return this.getRelativeFileName(filePath);
  }

  isJsModuleFile(): boolean {
    // Treat files as being part of js modules if they match the node module file naming convention
    // of module_name/index.js.
    return !('/' + this.currentFile.fileName).match(/\/index\.(js|es6|d\.ts|ts)$/);
  }

  private get currentOutput(): Output {
    return this.outputStack[this.outputStack.length - 1];
  }

  emit(s: string) {
    this.currentOutput.emit(s);
  }
  emitNoSpace(s: string) {
    this.currentOutput.emitNoSpace(s);
  }
  maybeLineBreak() {
    return this.currentOutput.maybeLineBreak();
  }
  enterCodeComment() {
    return this.currentOutput.enterCodeComment();
  }
  exitCodeComment() {
    return this.currentOutput.exitCodeComment();
  }

  enterTypeArgument() {
    this.typeArgumentDepth++;
  }
  exitTypeArgument() {
    this.typeArgumentDepth--;
  }
  get insideTypeArgument(): boolean {
    return this.typeArgumentDepth > 0;
  }

  emitType(s: string, comment: string) {
    return this.currentOutput.emitType(s, comment);
  }
  get insideCodeComment() {
    return this.currentOutput.insideCodeComment;
  }

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
    if (this.nodeSubstitutions.has(node)) {
      node = this.nodeSubstitutions.get(node);
    }
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

  private normalizeSlashes(filePath: string) {
    return filePath.replace(/\\/g, '/');
  }

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
      let lookupRes = ts.resolveModuleName(mod, containingFile, COMPILER_OPTIONS, compilerHost);
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
  private result = '';
  private firstColumn = true;

  insideCodeComment = false;
  private codeCommentResult = '';

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
    let buffer = this.insideCodeComment ? this.codeCommentResult : this.result;
    if (buffer.length > 0) {
      let lastChar = buffer.slice(-1);
      if (lastChar !== ' ' && lastChar !== '(' && lastChar !== '<' && lastChar !== '[' &&
          lastChar !== '_') {
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
    this.firstColumn = str.slice(-1) === '\n';
  }

  enterCodeComment() {
    if (this.insideCodeComment) {
      throw 'Cannot nest code comments' + this.codeCommentResult;
    }
    this.insideCodeComment = true;
    this.codeCommentResult = '';
  }

  emitType(s: string, comment: string) {
    this.emit(base.formatType(s, comment, {insideComment: this.insideCodeComment}));
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
    const trimmed = code.trim();
    const isMultilineComment = trimmed.indexOf('\n') !== -1;
    if (isMultilineComment) {
      this.emitNoSpace(code);
    } else {
      this.emitNoSpace(trimmed);
    }
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
