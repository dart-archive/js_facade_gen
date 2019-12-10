import * as chai from 'chai';
import * as fs from 'fs';
import * as ts from 'typescript';

import * as main from '../lib/main';

export type Input = string|Map<string, string>;

export function expectTranslate(tsCode: Input, options: main.TranspilerOptions = {}) {
  const result = translateSource(tsCode, options);
  return chai.expect(result);
}

export function expectErroneousCode(tsCode: Input, options: main.TranspilerOptions = {}) {
  options.failFast = false;  // Collect *all* errors.
  return chai.expect(() => translateSource(tsCode, options));
}

const defaultLibFileName = ts.getDefaultLibFileName(main.COMPILER_OPTIONS);
// Used to cache library files so that they don't need to be re-parsed for each test.
const libSourceFiles: Map<string, ts.SourceFile> = new Map();

export function parseAndNormalizeFiles(
    nameToContent: Map<string, string>, transpiler: main.Transpiler): ts.Program {
  const compilerOptions = transpiler.getCompilerOptions();
  const sourceFileMap: Map<string, ts.SourceFile> = new Map();

  let compilerHost = ts.createCompilerHost(compilerOptions);
  compilerHost.getSourceFile = (sourceName) => {
    let sourcePath = sourceName;
    if (sourcePath === defaultLibFileName) {
      sourcePath = ts.getDefaultLibFilePath(compilerOptions);
    } else if (sourceFileMap.has(sourceName)) {
      return sourceFileMap.get(sourceName);
    } else if (nameToContent.has(sourcePath)) {
      return ts.createSourceFile(
          sourcePath, nameToContent.get(sourcePath), compilerOptions.target, true);
    } else if (!fs.existsSync(sourcePath)) {
      return undefined;
    }

    if (!libSourceFiles.has(sourcePath)) {
      const contents = fs.readFileSync(sourcePath, 'utf-8');
      // Cache to avoid excessive test times.
      libSourceFiles.set(
          sourcePath, ts.createSourceFile(sourcePath, contents, compilerOptions.target, true));
    }
    return libSourceFiles.get(sourcePath);
  };
  compilerHost.fileExists = (sourceName) => {
    return nameToContent.has(sourceName);
  };
  compilerHost.readFile = () => {
    throw new Error('unexpected call to readFile');
  };
  compilerHost.useCaseSensitiveFileNames = () => false;
  compilerHost.getCanonicalFileName = (fileName) => `../${fileName}`;
  compilerHost.getCurrentDirectory = () => 'fakeDir';
  compilerHost.resolveModuleNames = main.getModuleResolver(compilerHost);

  // Create a program from inputs.
  const entryPoints = new Set(nameToContent.keys());

  transpiler.normalizeSourceFiles(entryPoints, sourceFileMap, compilerHost);

  // Create a new program after performing source file transformations.
  const updatedProgram = ts.createProgram(Array.from(entryPoints), compilerOptions, compilerHost);
  return updatedProgram;
}

export const FAKE_MAIN = 'demo/some/main.ts';

export function translateSources(
    contents: Input, options: main.TranspilerOptions = {}): Map<string, string> {
  // Default to quick stack traces.
  if (!options.hasOwnProperty('failFast')) {
    options.failFast = true;
  }

  let namesToContent: Map<string, string>;
  if (typeof contents === 'string') {
    namesToContent = new Map();
    namesToContent.set(FAKE_MAIN, contents);
  } else {
    namesToContent = contents;
  }
  options.enforceUnderscoreConventions = true;
  const transpiler = new main.Transpiler(options);
  const program = parseAndNormalizeFiles(namesToContent, transpiler);
  return transpiler.translateProgram(program, Array.from(namesToContent.keys()));
}

export function translateSource(contents: Input, options: main.TranspilerOptions = {}): string {
  const results = translateSources(contents, options);
  // Return the main outcome, from 'main.ts'.
  let result = results.get(FAKE_MAIN);
  // Strip out the package:js import as it clutters the output.
  result = result.replace(/import "package:js\/js.dart";\s+/g, '');
  result = result.replace(/^@JS\("?[^)]*"?\)\s+library [^;]+;\s+/g, '');
  return result.trim();
}
