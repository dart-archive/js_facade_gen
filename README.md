[![Build Status](https://travis-ci.org/dart-lang/js_facade_gen.svg?branch=master)](https://travis-ci.org/dart-lang/js_facade_gen)

Generates `package:js` Javascript interop facades for arbitrary TypeScript
libraries.

## Installation

- [Install Node.js](https://docs.npmjs.com/getting-started/installing-node)
   - We depend on Node.js so that we can analyze TypeScript files using the [TypeScript language services](https://www.npmjs.com/package/typescript-services) package. This ensures we parse `d.ts` consistently with other tools.
- Execute `npm install -g dart_js_facade_gen` to install.

## Usage

### Basic
`dart_js_facade_gen <input d.ts file>`
Dart interop facade file is written to stdout.

### Advanced
`dart_js_facade_gen --destination=<destination-dir> --basePath=<input d.ts file directory> <input d.ts file> <input d.ts file> ...`

#### Flags
`--destination=<destination-dir>`: Output generated code to destination-dir
`--generate-html`: Generate facades for dart:html types rather than importing them
`--explicit-static`: Disables default assumption that properties declared on the anonymous types of top level variable declarations are static

### Example
`dart_js_facade_gen --destination=/usr/foo/tmp/chartjs/lib --basePath=/usr/foo/git/DefinitelyTyped/chartjs /usr/foo/git/DefinitelyTyped/chartjs/chart.d.ts`

## Development

- The Dart SDK must be available to run end to end tests.

### Gulp tasks

- `gulp watch` executes the unit tests in watch mode (use `gulp test.unit` for a single run),
- `gulp test.check-format` checks the source code formatting using `clang-format`,
- `gulp test` runs unit tests, e2e tests and checks the source code formatting.

### Publish

 - `npm run prepublish`
 - `npm publish`
