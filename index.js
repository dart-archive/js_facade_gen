#!/usr/bin/env node

const main = require('./build/lib/main.js');

var args = require('minimist')(process.argv.slice(2), {
  base: 'string',
  boolean: ['semantic-diagnostics', 'generate-html', 'explicit-static'],
  alias: {
    'base-path': 'basePath',
    'semantic-diagnostics': 'semanticDiagnostics',
    'generate-html': 'generateHTML',
    'explicit-static': 'explicitStatic'
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
