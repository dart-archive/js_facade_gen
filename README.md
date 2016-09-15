[![Build Status](https://travis-ci.org/dart-lang/js_facade_gen.svg?branch=master)](https://travis-ci.org/dart-lang/js_facade_gen)

Generates `package:js` Javascript interop facades for arbitrary TypeScript
libraries.

## Installation

- execute `npm i` to install the dependencies,
- the Dart SDK must be available to run end to end tests.

## Usage

`node build/lib/main.js --destination=<destination-dir> <input d.ts directory>`

## Gulp tasks

- `gulp watch` executes the unit tests in watch mode (use `gulp test.unit` for a single run),
- `gulp test.e2e` executes the e2e tests,
- `gulp test.check-format` checks the source code formatting using `clang-format`,
- `gulp test` runs unit tests, e2e tests and checks the source code formatting.

## Publish

 - `npm run prepublish`
 - `npm publish`
