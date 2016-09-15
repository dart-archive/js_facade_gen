/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectErroneousCode, expectTranslate} from './test_support';

describe('variables', () => {
  it('should print variable declaration with initializer', () => {
    expectTranslate('var a:number = 1;').to.equal(`@JS()
external num get a;
@JS()
external set a(num v);`);
  });
  it('should print variable declaration', () => {
    expectTranslate('var a:number;').to.equal(`@JS()
external num get a;
@JS()
external set a(num v);`);
    expectTranslate('var a;').to.equal(`@JS()
external get a;
@JS()
external set a(v);`);
    expectTranslate('var a:any;').to.equal(`@JS()
external dynamic get a;
@JS()
external set a(dynamic v);`);
  });
  it('should transpile variable declaration lists', () => {
    expectTranslate('var a: A;').to.equal(`@JS()
external A get a;
@JS()
external set a(A v);`);
    expectTranslate('var a, b;').to.equal(`@JS()
external get a;
@JS()
external set a(v);
@JS()
external get b;
@JS()
external set b(v);`);
  });
  it('should transpile variable declaration lists with initializers', () => {
    expectTranslate('var a = 0;').to.equal(`@JS()
external get a;
@JS()
external set a(v);`);
    expectTranslate('var a, b = 0;').to.equal(`@JS()
external get a;
@JS()
external set a(v);
@JS()
external get b;
@JS()
external set b(v);`);
    expectTranslate('var a = 1, b = 0;').to.equal(`@JS()
external get a;
@JS()
external set a(v);
@JS()
external get b;
@JS()
external set b(v);`);
  });
  it('support vardecls containing more than one type (implicit or explicit)', () => {
    expectTranslate('var a: A, untyped;').to.equal(`@JS()
external A get a;
@JS()
external set a(A v);
@JS()
external get untyped;
@JS()
external set untyped(v);`);
    expectTranslate('var untyped, b: B;').to.equal(`@JS()
external get untyped;
@JS()
external set untyped(v);
@JS()
external B get b;
@JS()
external set b(B v);`);
    expectTranslate('var n: number, s: string;').to.equal(`@JS()
external num get n;
@JS()
external set n(num v);
@JS()
external String get s;
@JS()
external set s(String v);`);
    expectTranslate('var untyped, n: number, s: string;').to.equal(`@JS()
external get untyped;
@JS()
external set untyped(v);
@JS()
external num get n;
@JS()
external set n(num v);
@JS()
external String get s;
@JS()
external set s(String v);`);
  });

  it('supports const', () => {
    // Arbitrary expressions essentially translate const ==> final
    // but Dart doesn't allow external fields so we use getters instead.
    expectTranslate('const A = 1 + 2;').to.equal(`@JS()
external get A;`);
    // ... but literals are special cased to be deep const.
    expectTranslate('const A = 1, B = 2;').to.equal(`@JS()
external get A;
@JS()
external get B;`);
    expectTranslate('const A: number = 1;').to.equal(`@JS()
external num get A;`);
  });
});

describe('classes', () => {
  it('should translate classes', () => {
    expectTranslate('class X {}').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('should support extends', () => {
    expectTranslate('class X extends Y {}').to.equal(`@JS()
class X extends Y {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
  });
  it('should support implements', () => {
    expectTranslate('class X implements Y, Z {}').to.equal(`@JS()
class X implements Y, Z {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('should support implements', () => {
    expectTranslate('class X extends Y implements Z {}').to.equal(`@JS()
class X extends Y implements Z {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
  });
  it('should support abstract', () => {
    expectTranslate('abstract class X {}').to.equal(`@JS()
abstract class X {
  // @Ignore
  X.fakeConstructor$();
}`);
  });

  describe('members', () => {
    it('supports empty declarations', () => {
      expectTranslate('class X { ; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}`);
    });
    it('supports fields', () => {
      expectTranslate('class X { x: number; y: string; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num get x;
  external set x(num v);
  external String get y;
  external set y(String v);
}`);
      expectTranslate('class X { x; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get x;
  external set x(v);
}`);
    });
    it('supports function typed fields', () => {
      expectTranslate(
          'interface FnDef {(y: number): string;}\n' +
          'class X { x: FnDef; }')
          .to.equal(`typedef String FnDef(num y);

@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external FnDef get x;
  external set x(FnDef v);
}`);
    });
    it('supports field initializers', () => {
      expectTranslate('class X { x: number = 42; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num get x;
  external set x(num v);
}`);
    });
    // TODO(martinprobst): Re-enable once Angular is migrated to TS.
    it('supports visibility modifiers', () => {
      expectTranslate('class X { private _x; x; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get JS$_x;
  external set JS$_x(v);
  external get x;
  external set x(v);
}`);
      expectTranslate('class X { private x; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get x;
  external set x(v);
}`);
      expectTranslate('class X { constructor (private x) {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get x;
  external set x(v);
  external factory X(x);
}`);
      expectTranslate('class X { _x; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get JS$_x;
  external set JS$_x(v);
}`);
    });
    it('allow protected', () => {
      expectTranslate('class X { protected x; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external get x;
  external set x(v);
}`);
    });
    it('supports static fields', () => {
      expectTranslate('class X { static x: number = 42; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external static num get x;
  external static set x(num v);
}`);
    });
    it('supports methods', () => {
      expectTranslate('class X { x() { return 42; } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external x();
}`);
    });
    it('supports abstract methods', () => {
      expectTranslate('abstract class X { abstract x(); }').to.equal(`@JS()
abstract class X {
  // @Ignore
  X.fakeConstructor$();
  external x();
}`);
    });
    it('supports method return types', () => {
      expectTranslate('class X { x(): number { return 42; } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num x();
}`);
    });
    it('supports method params', () => {
      expectTranslate('class X { x(a, b) { return 42; } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external x(a, b);
}`);
    });
    it('supports method return types', () => {
      expectTranslate('class X { x( a : number, b : string ) { return 42; } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external x(num a, String b);
}`);
    });
    it('supports get methods', () => {
      expectTranslate('class X { get y(): number {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num get y;
}`);
      expectTranslate('class X { static get Y(): number {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external static num get Y;
}`);
    });
    it('supports set methods', () => {
      expectTranslate('class X { set y(n: number) {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external set y(num n);
}`);
      expectTranslate('class X { static get Y(): number {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external static num get Y;
}`);
    });
    it('supports constructors', () => {
      expectTranslate('class X { constructor() {} }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
    });
    it('supports parameter properties', () => {
      expectTranslate(
          'class X { c: number; \n' +
          '  constructor(private _bar: B, ' +
          'public foo: string = "hello", ' +
          'private _goggles: boolean = true) {} }')
          .to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external B get JS$_bar;
  external set JS$_bar(B v);
  external String get foo;
  external set foo(String v);
  external bool get JS$_goggles;
  external set JS$_goggles(bool v);
  external num get c;
  external set c(num v);
  external factory X(B JS$_bar, [String foo, bool JS$_goggles]);
}`);
      expectTranslate(
          '@CONST class X { ' +
          'constructor(public foo: string, b: number, private _marbles: boolean = true) {} }')
          .to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external String get foo;
  external set foo(String v);
  external bool get JS$_marbles;
  external set JS$_marbles(bool v);
  external factory X(String foo, num b, [bool JS$_marbles]);
}`);
    });
  });
});

describe('interfaces', () => {
  it('translates interfaces to abstract classes', () => {
    expectTranslate('interface X {}').to.equal(`@anonymous
@JS()
abstract class X {}`);
  });
  it('translates interface extends to class implements', () => {
    expectTranslate('interface X extends Y, Z {}').to.equal(`@anonymous
@JS()
abstract class X implements Y, Z {}`);
  });
  it('supports abstract methods', () => {
    expectTranslate('interface X { x(); }').to.equal(`@anonymous
@JS()
abstract class X {
  external x();
}`);
  });
  it('supports interface properties', () => {
    expectTranslate('interface X { x: string; y; }').to.equal(`@anonymous
@JS()
abstract class X {
  external String get x;
  external set x(String v);
  external get y;
  external set y(v);
  external factory X({String x, y});
}`);
  });
});

describe('single call signature interfaces', () => {
  it('should support declaration', () => {
    expectTranslate('interface F { (n: number): boolean; }').to.equal('typedef bool F(num n);');
  });
  it('should support generics', () => {
    expectTranslate('interface F<A, B> { (a: A): B; }').to.equal('typedef B F<A, B>(A a);');
  });
});

describe('enums', () => {
  it('should support basic enum declaration', () => {
    expectTranslate('enum Color { Red, Green, Blue }').to.equal(`@JS()
class Color {
  external static num get Red;
  external static num get Green;
  external static num get Blue;
}`);
  });
  it('allow empty enum', () => {
    expectTranslate('enum Empty {}').to.equal(`@JS()
class Empty {}`);
  });
  it('enum with initializer', () => {
    expectTranslate('enum Color { Red = 1, Green, Blue = 4 }').to.equal(`@JS()
class Color {
  external static num get Red;
  external static num get Green;
  external static num get Blue;
}`);
  });
  it('should ingore switch', () => {
    expectTranslate('switch(c) { case Color.Red: break; default: break; }').to.equal('');
  });
  it('does not support const enum', () => {
    expectErroneousCode('const enum Color { Red }').to.throw('const enums are not supported');
  });
});
