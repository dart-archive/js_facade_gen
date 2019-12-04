[![Build Status](https://travis-ci.org/dart-lang/js_facade_gen.svg?branch=master)](https://travis-ci.org/dart-lang/js_facade_gen)

Generates `package:js` JavaScript interop facades for arbitrary TypeScript libraries.

## Installation

- [Install Node.js](https://docs.npmjs.com/getting-started/installing-node)
   - We depend on Node.js so that we can analyze TypeScript files using the [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API) in the [TypeScript](https://www.npmjs.com/package/typescript) package. This ensures we parse `d.ts` consistently with other tools.
- Execute `npm install -g dart_js_facade_gen` to install.

## Usage

### Basic
`dart_js_facade_gen <input d.ts file>`<br>
Dart interop facade file is written to stdout.

### Advanced
`dart_js_facade_gen --destination=<destination-dir> --base-path=<input d.ts file directory> <input d.ts file> <input d.ts file> ...`

#### Flags
`--destination=<destination-dir>`: Output generated code to destination-dir.<br>
`--base-path=<input d.ts file directory>`: Specify the directory that contains the input d.ts files.<br>
`--skip-formatting`: Skips running dart-format on the output. This is useful for large files (like dom.d.ts) since the node package version of dart-format is significantly slower than the version in the SDK.<br>
`--generate-html`: Generate facades for dart:html types rather than importing them.<br>
`--rename-conflicting-types`: Rename types to avoid conflicts in cases where a variable and a type have the exact same name, but it is not clear if they are related or not.<br>
`--explicit-static`: Disables default assumption that properties declared on the anonymous types of top level variable declarations are static.<br>
`--trust-js-types`: Emits @anonymous tags on classes that have neither constructors nor static members. This prevents the Dart Dev Compiler from checking whether or not objects are truly instances of those classes. This flag should be used if the input JS/TS library has structural types, or is otherwise claiming that types match in cases where the correct JS prototype is not there for DDC to check against.

### Example
`dart_js_facade_gen --destination=/usr/foo/tmp/chartjs/lib --base-path=/usr/foo/git/DefinitelyTyped/chartjs /usr/foo/git/DefinitelyTyped/chartjs/chart.d.ts`

### Gulp tasks

- `gulp watch` executes the unit tests in watch mode (use `gulp test.unit` for a single run),
- `gulp test.check-format` checks the source code formatting using `clang-format`,
- `gulp test` runs unit tests and checks the source code formatting.

### Publish

 - `npm run prepublish`
 - `npm publish`
