/// <reference path="../typings/chai/chai.d.ts"/>
/// <reference path="../typings/mocha/mocha.d.ts"/>
/// <reference path="../typings/node/node.d.ts"/>
import chai = require('chai');
import fs = require('fs');
import main = require('../lib/main');
import ts = require('typescript');

export type StringMap = {
  [k: string]: string
};
export type Input = string | StringMap;

export function expectTranslate(tsCode: Input, options: main.TranspilerOptions = {}) {
  let result = translateSource(tsCode, options);
  return chai.expect(result);
}

export function expectErroneousCode(tsCode: Input, options: main.TranspilerOptions = {}) {
  options.failFast = false;  // Collect *all* errors.
  return chai.expect(() => translateSource(tsCode, options));
}

let compilerOptions = main.COMPILER_OPTIONS;
let defaultLibName = ts.getDefaultLibFileName(compilerOptions);
let libSource = fs.readFileSync(ts.getDefaultLibFilePath(compilerOptions), 'utf-8');
let libSourceFile: ts.SourceFile;

export function parseFiles(nameToContent: StringMap): ts.Program {
  let result: string;
  let compilerHost: ts.CompilerHost = {
    getSourceFile: function(sourceName, languageVersion) {
      if (nameToContent.hasOwnProperty(sourceName)) {
        return ts.createSourceFile(
            sourceName, nameToContent[sourceName], compilerOptions.target, true);
      }
      if (sourceName === defaultLibName) {
        if (!libSourceFile) {
          // Cache to avoid excessive test times.
          libSourceFile = ts.createSourceFile(sourceName, libSource, compilerOptions.target, true);
        }
        return libSourceFile;
      }
      return undefined;
    },
    writeFile: function(name, text, writeByteOrderMark) { result = text; },
    fileExists: (sourceName) => { return !!nameToContent[sourceName]; },
    readFile: (filename): string => { throw new Error('unexpected call to readFile'); },
    getDefaultLibFileName: () => defaultLibName,
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => '../' + filename,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n',
  };
  compilerHost.resolveModuleNames = main.getModuleResolver(compilerHost);
  // Create a program from inputs
  let entryPoints = Object.keys(nameToContent);
  let program: ts.Program = ts.createProgram(entryPoints, compilerOptions, compilerHost);
  if (program.getSyntacticDiagnostics().length > 0) {
    // Throw first error.
    let first = program.getSyntacticDiagnostics()[0];
    throw new Error(`${first.start}: ${first.messageText} in ${nameToContent[entryPoints[0]]}`);
  }
  return program;
}

export const FAKE_MAIN = 'demo/some/main.ts';

export function translateSources(contents: Input, options: main.TranspilerOptions = {}): StringMap {
  // Default to quick stack traces.
  if (!options.hasOwnProperty('failFast')) options.failFast = true;
  let namesToContent: StringMap;
  if (typeof contents === 'string') {
    namesToContent = {};
    namesToContent[FAKE_MAIN] = contents;
  } else {
    namesToContent = contents;
  }
  options.enforceUnderscoreConventions = true;
  let transpiler = new main.Transpiler(options);
  let program = parseFiles(namesToContent);
  return transpiler.translateProgram(program);
}

export function translateSource(contents: Input, options: main.TranspilerOptions = {}): string {
  options.useHtml = true;

  let results = translateSources(contents, options);
  // Return the main outcome, from 'main.ts'.
  let result = results[FAKE_MAIN];
  // strip out the package:js import as it clutters the output.
  result = result.replace(/import "package:js\/js.dart";\s+/g, '');
  result = result.replace(/^@JS\(\)\s+library [^;]+;\s+/g, '');
  return result.trim();
}
