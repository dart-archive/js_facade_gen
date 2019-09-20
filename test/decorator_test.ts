import {expectTranslate} from './test_support';


// We want to ignore decorators on JS interop for now.
// These tests make sure we haven't accidentally left in historic code from
// ts2dart that export decorators.
describe('ignore decorators', () => {
  it('translates plain decorators', () => {
    expectTranslate('@A class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('ignore plain decorators applied to abstract classes', () => {
    expectTranslate('@A abstract class X {}').to.equal(`@JS()
abstract class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('translates arguments', () => {
    expectTranslate('@A(a, b) class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('translates const arguments', () => {
    expectTranslate('@A([1]) class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
    expectTranslate('@A({"a": 1}) class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
    expectTranslate('@A(new B()) class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('translates on functions', () => {
    expectTranslate('@A function f() {}').to.equal(`@JS()
external f();`);
  });
  it('translates on properties', () => {
    expectTranslate('class X { @A p; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get p;
  external set p(v);
}`);
  });
  it('translates on parameters', () => {
    expectTranslate('function f (@A p) {}').to.equal(`@JS()
external f(p);`);
  });
  it('ignore special cases @CONST', () => {
    expectTranslate('@CONST class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
    expectTranslate('@CONST() class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
    expectTranslate(`@CONST class X {
                       x: number;
                       y;
                       constructor() { super(3); this.x = 1; this.y = 2; }
                     }`)
        .to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num get x;
  external set x(num v);
  external get y;
  external set y(v);
  external factory X();
}`);

    // @CONST constructors.
    expectTranslate('@CONST class X { constructor() {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
    // For backwards-compatibility for traceur inputs (not valid TS input)
    expectTranslate('class X { @CONST constructor() {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);

    // @CONST properties.
    expectTranslate('class Foo { @CONST() static foo = 1; }').to.equal(`@JS()
class Foo {
  // @Ignore
  Foo.fakeConstructor$();
  external static get foo;
  external static set foo(v);
}`);
  });
});
