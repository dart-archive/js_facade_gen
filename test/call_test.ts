import {expectTranslate} from './test_support';

describe('calls', () => {
  it('translates destructuring parameters', () => {
    expectTranslate('function x({p = null, d = false} = {}) {}').to.equal(`@JS()
external x(Object p_d /*{p = null, d = false}*/);`);
    expectTranslate('function x({a=false}={a:true})').to.equal(`@JS()
external x(Object a /*{a=false}*/);`);
    expectTranslate('function x({a=false}=true)').to.equal(`@JS()
external x(Object a /*{a=false}*/);`);
    expectTranslate('class X { constructor() { super({p: 1}); } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
  });
  it('suppress calls with literal parameters', () => {
    expectTranslate('f(x, {a: 12, b: 4});').to.equal('');
    expectTranslate('f({a: 12});').to.equal('');
    expectTranslate('f({"a": 12});').to.equal('');
    expectTranslate('new X(x, {a: 12, b: 4});').to.equal('');
    expectTranslate('f(x, {});').to.equal('');
  });
  it('suppress calls', () => {
    expectTranslate('foo();').to.equal('');
    expectTranslate('foo(1, 2);').to.equal('');
  });
  it('suppress new calls', () => {
    expectTranslate('new Foo();').to.equal('');
    expectTranslate('new Foo(1, 2);').to.equal('');
    expectTranslate('new Foo<number, string>(1, 2);').to.equal('');
  });
  it('suppress "super()" constructor calls', () => {
    expectTranslate('class X { constructor() { super(1); } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
    expectTranslate('class X { constructor() { if (y) super(1, 2); } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
    expectTranslate('class X { constructor() { a(); super(1); b(); } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
  });
  it('ignore "super.x()" super method calls', () => {
    expectTranslate('class X { y() { super.z(1); } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external y();
}`);
  });
  it('suppress new calls without arguments', () => {
    expectTranslate('new Foo;').to.equal('');
  });
});
