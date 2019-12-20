#!/usr/bin/env node

const main = require('./build/lib/main.js');

var args = require('minimist')(process.argv.slice(2), {
  string: ['base-path'],
  boolean: [
    'semantic-diagnostics', 'skip-formatting', 'generate-html', 'rename-conflicting-types',
    'explicit-static', 'trust-js-types', 'to-json'
  ],
  default: {'base-path': ''},
  alias: {
    'base-path': 'basePath',
    'semantic-diagnostics': 'semanticDiagnostics',
    'skip-formatting': 'skipFormatting',
    'generate-html': 'generateHTML',
    'rename-conflicting-types': 'renameConflictingTypes',
    'explicit-static': 'explicitStatic',
    'trust-js-types': 'trustJSTypes',
    'to-json': 'toJSON'
  }
});
try {
  var transpiler = new main.Transpiler(args);
  if (args.destination) console.error('Transpiling', args._, 'to', args.destination);
  transpiler.transpile(args._, args.destination);
} catch (e) {
  if (e.name !== 'DartFacadeError') throw e;
  console.error(e.message);
  process.exit(1);
}
