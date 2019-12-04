import chai = require('chai');
import main = require('../lib/main');
import ModuleTranspiler from '../lib/module';
import {FacadeConverter} from '../lib/facade_converter';

import {expectTranslate, expectErroneousCode, translateSources} from './test_support';

describe('imports', () => {
  it('ignore import equals statements', () => {
    expectTranslate('import x = require("y");').to.equal('import "y.dart" as x;');
  });
  it('ignore import from statements', () => {
    expectTranslate('import {x,y} from "z";').to.equal('');
  });
  it('ignore import star', () => {
    expectTranslate('import * as foo from "z";').to.equal('');
  });
  it('ignore renamed imports', () => {
    expectTranslate('import {Foo as Bar} from "baz";').to.equal('');
  });
  it('empty import spec generates safe Dart code', () => {
    expectTranslate('import {} from "baz";').to.equal('');
  });
});

describe('exports', () => {
  // Dart exports are implicit, everything non-private is exported by the library.
  it('allows variable exports', () => {
    expectTranslate('export var x = 12;').to.equal(`@JS()
external get x;
@JS()
external set x(v);`);
  });
  it('allows class exports', () => {
    expectTranslate('export class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('allows export declarations', () => {
    expectTranslate('export * from "X";').to.equal('export "X.dart";');
  });
  it('allows export declarations', () => {
    expectTranslate('export * from "./X";').to.equal('export "X.dart";');
  });
  it('allows named export declarations', () => {
    expectTranslate('export {a, b} from "X";').to.equal('export "X.dart" show a, b;');
  });
  it('ignores named export declarations', () => {
    expectTranslate(`declare module '../some_other_module' {
    interface Foo { }
   }`)
        .to.equal(
            '// Library augmentation not allowed by Dart. Ignoring augmentation of ../some_other_module');
  });

  it('fails for renamed exports', () => {
    expectErroneousCode('export {Foo as Bar} from "baz";')
        .to.throw(/import\/export renames are unsupported in Dart/);
  });
  it('fails for exports without URLs', () => {
    expectErroneousCode('export {a as b};').to.throw('re-exports must have a module URL');
  });
  it('fails for empty export specs', () => {
    expectErroneousCode('export {} from "baz";').to.throw(/empty export list/);
  });
});

describe('module name', () => {
  let transpiler: main.Transpiler;
  let modTranspiler: ModuleTranspiler;
  beforeEach(() => {
    transpiler = new main.Transpiler({failFast: true, moduleName: 'sample_module', basePath: '/a'});
    modTranspiler =
        new ModuleTranspiler(transpiler, new FacadeConverter(transpiler, ''), 'sample_module');
  });
  it('adds module name', () => {
    let results = translateSources(
        new Map(Object.entries({'/a/b/c.ts': 'var x;'})),
        {failFast: true, moduleName: 'sample_module', basePath: '/a'});
    chai.expect(results.get('/a/b/c.ts')).to.equal(`@JS("sample_module")
library b.c;

import "package:js/js.dart";

@JS()
external get x;
@JS()
external set x(v);
`);
  });
  it('leaves relative paths alone', () => {
    chai.expect(modTranspiler.getLibraryName('a/b')).to.equal('a.b');
  });
  it('handles reserved words', () => {
    chai.expect(modTranspiler.getLibraryName('/a/for/in/do/x')).to.equal('_for._in._do.x');
  });
  it('handles built-in and limited keywords', () => {
    chai.expect(modTranspiler.getLibraryName('/a/as/if/sync/x')).to.equal('as._if.sync.x');
  });
  it('handles file extensions', () => {
    chai.expect(modTranspiler.getLibraryName('a/x.ts')).to.equal('a.x');
    chai.expect(modTranspiler.getLibraryName('a/x.js')).to.equal('a.x');
  });
  it('handles non word characters', () => {
    chai.expect(modTranspiler.getLibraryName('a/%x.ts')).to.equal('a._x');
  });
});
