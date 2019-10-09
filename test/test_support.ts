import chai = require('chai');
import fs = require('fs');
import main = require('../lib/main');
import ts = require('typescript');

export type StringMap = {
  [k: string]: string
};
export type Input = string|StringMap;

export function expectTranslate(tsCode: Input, options?: main.TranspilerOptions) {
  options = options || {};
  let result = translateSource(tsCode, options);
  return chai.expect(result);
}

export function expectErroneousCode(tsCode: Input, options?: main.TranspilerOptions) {
  options = options || {};
  options.failFast = false;  // Collect *all* errors.
  return chai.expect(() => translateSource(tsCode, options));
}

let compilerOptions = main.COMPILER_OPTIONS;
let defaultLibFileName = ts.getDefaultLibFileName(compilerOptions);
let libSourceFiles: Map<string, ts.SourceFile> = new Map();

export function parseFiles(
    nameToContent: StringMap, currentRunCompilerOpts: ts.CompilerOptions): ts.Program {
  let result: string;
  let compilerHost = ts.createCompilerHost(currentRunCompilerOpts);
  compilerHost.getSourceFile = (sourceName) => {
    let sourcePath = sourceName;
    if (sourcePath === defaultLibFileName) {
      sourcePath = ts.getDefaultLibFilePath(currentRunCompilerOpts);
    } else if (nameToContent.hasOwnProperty(sourcePath)) {
      return ts.createSourceFile(
          sourcePath, nameToContent[sourcePath], currentRunCompilerOpts.target, true);
    } else if (!fs.existsSync(sourcePath)) {
      return undefined;
    }

    if (!libSourceFiles.has(sourcePath)) {
      let contents = fs.readFileSync(sourcePath, 'utf-8');
      // Cache to avoid excessive test times.
      libSourceFiles.set(
          sourcePath,
          ts.createSourceFile(sourcePath, contents, currentRunCompilerOpts.target, true));
    }
    return libSourceFiles.get(sourcePath);
  };
  compilerHost.writeFile = (name, text, writeByteOrderMark) => {
    result = text;
  };
  compilerHost.fileExists = (sourceName) => !!nameToContent[sourceName];
  compilerHost.readFile = () => {
    throw new Error('unexpected call to readFile');
  };
  compilerHost.useCaseSensitiveFileNames = () => false;
  compilerHost.getCanonicalFileName = (fileName) => `../${fileName}`;
  compilerHost.getCurrentDirectory = () => 'fakeDir';
  compilerHost.resolveModuleNames = main.getModuleResolver(compilerHost);

  // Create a program from inputs
  let entryPoints = Object.keys(nameToContent);
  let program: ts.Program = ts.createProgram(entryPoints, currentRunCompilerOpts, compilerHost);
  if (program.getSyntacticDiagnostics().length > 0) {
    // Throw first error.
    let first = program.getSyntacticDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${nameToContent[entryPoints[0]]}`);
  }
  return program;
}

export const FAKE_MAIN = 'demo/some/main.ts';

export function translateSources(contents: Input, options?: main.TranspilerOptions): StringMap {
  options = options || {};
  // Default to quick stack traces.
  if (!options.hasOwnProperty('failFast')) options.failFast = true;
  const currentRunCompilerOpts = Object.assign({}, compilerOptions);
  if (options.generateHTML) {
    currentRunCompilerOpts.lib = ['lib.es2015.d.ts', 'lib.scripthost.d.ts'];
  }

  let namesToContent: StringMap;
  if (typeof contents === 'string') {
    namesToContent = {};
    namesToContent[FAKE_MAIN] = contents;
  } else {
    namesToContent = contents;
  }
  options.enforceUnderscoreConventions = true;
  let transpiler = new main.Transpiler(options);
  let program = parseFiles(namesToContent, currentRunCompilerOpts);
  return transpiler.translateProgram(program);
}

export function translateSource(contents: Input, options?: main.TranspilerOptions): string {
  options = options || {};
  let results = translateSources(contents, options);
  // Return the main outcome, from 'main.ts'.
  let result = results[FAKE_MAIN];
  // strip out the package:js import as it clutters the output.
  result = result.replace(/import "package:js\/js.dart";\s+/g, '');
  result = result.replace(/^@JS\("?[^)]*"?\)\s+library [^;]+;\s+/g, '');
  return result.trim();
}
