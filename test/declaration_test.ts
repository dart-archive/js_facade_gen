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
    it('should emit extension methods to return Futures from methods that return Promises', () => {
      expectTranslate(`declare class MyMath {
        randomInRange(start: number, end: number): Promise<number>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class MyMath {
  // @Ignore
  MyMath.fakeConstructor$();
}

@JS("MyMath")
abstract class _MyMath {
  external Promise<num> randomInRange(num start, num end);
}

extension MyMathExtensions on MyMath {
  Future<num> randomInRange(num start, num end) {
    final Object t = this;
    final _MyMath tt = t;
    return promiseToFuture(tt.randomInRange(start, end));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
      expectTranslate(`declare class X<T> {
        f(a: T): Promise<T>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class X<T> {
  // @Ignore
  X.fakeConstructor$();
}

@JS("X")
abstract class _X<T> {
  external Promise<T> f(T a);
}

extension XExtensions<T> on X<T> {
  Future<T> f(T a) {
    final Object t = this;
    final _X<T> tt = t;
    return promiseToFuture(tt.f(a));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
      expectTranslate(`declare class Y {
        a: number;
      }
      
      declare class Z extends Y {
        f(): Promise<string>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class Y {
  // @Ignore
  Y.fakeConstructor$();
  external num get a;
  external set a(num v);
}

@JS()
class Z extends Y {
  // @Ignore
  Z.fakeConstructor$() : super.fakeConstructor$();
}

@JS("Z")
abstract class _Z {
  external Promise<String> f();
}

extension ZExtensions on Z {
  Future<String> f() {
    final Object t = this;
    final _Z tt = t;
    return promiseToFuture(tt.f());
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
      expectTranslate(`declare class X {
        f(a: string): Promise<number>;
        f(a: string, b: number): Promise<number>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}

@JS("X")
abstract class _X {
  /*external Promise<num> f(String a);*/
  /*external Promise<num> f(String a, num b);*/
  external Promise<num> f(String a, [num b]);
}

extension XExtensions on X {
  Future<num> f(String a, [num b]) {
    final Object t = this;
    final _X tt = t;
    if (b == null) {
      return promiseToFuture(tt.f(a));
    }
    return promiseToFuture(tt.f(a, b));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
      expectTranslate(`declare class X {
        f(a: string): Promise<number>;
        f(a: number, b: number): Promise<number>;
        f(c: number[]): Promise<number>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
}

@JS("X")
abstract class _X {
  /*external Promise<num> f(String a);*/
  /*external Promise<num> f(num a, num b);*/
  /*external Promise<num> f(List<num> c);*/
  external Promise<num> f(dynamic /*String|num|List<num>*/ a_c, [num b]);
}

extension XExtensions on X {
  Future<num> f(dynamic /*String|num|List<num>*/ a_c, [num b]) {
    final Object t = this;
    final _X tt = t;
    if (b == null) {
      return promiseToFuture(tt.f(a_c));
    }
    return promiseToFuture(tt.f(a_c, b));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
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
    it('should emit extension getters/setters that expose Futures in place of Promises', () => {
      expectTranslate(`declare class MyMath {
        readonly two: Promise<num>;
        three: Promise<num>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class MyMath {
  // @Ignore
  MyMath.fakeConstructor$();
}

@JS("MyMath")
abstract class _MyMath {
  external Promise<num> get two;
  external Promise<num> get three;
  external set three(Promise<num> v);
}

extension MyMathExtensions on MyMath {
  Future<num> get two {
    final Object t = this;
    final _MyMath tt = t;
    return promiseToFuture(tt.two);
  }

  Future<num> get three {
    final Object t = this;
    final _MyMath tt = t;
    return promiseToFuture(tt.three);
  }

  set three(Future<num> v) {
    final Object t = this;
    final _MyMath tt = t;
    tt.three = Promise<num>(allowInterop((resolve, reject) {
      v.then(resolve, onError: reject);
    }));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
      expectTranslate(`declare class X<T> {
        aPromise: Promise<T>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@JS()
class X<T> {
  // @Ignore
  X.fakeConstructor$();
}

@JS("X")
abstract class _X<T> {
  external Promise<T> get aPromise;
  external set aPromise(Promise<T> v);
}

extension XExtensions<T> on X<T> {
  Future<T> get aPromise {
    final Object t = this;
    final _X<T> tt = t;
    return promiseToFuture(tt.aPromise);
  }

  set aPromise(Future<T> v) {
    final Object t = this;
    final _X<T> tt = t;
    tt.aPromise = Promise<T>(allowInterop((resolve, reject) {
      v.then(resolve, onError: reject);
    }));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
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
  it('should emit extension methods to return Futures from methods that return Promises',
     () => {
       expectTranslate(`declare interface X<T> {
        f(a: T): Promise<T>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@anonymous
@JS()
abstract class X<T> {}

@anonymous
@JS()
abstract class _X<T> {
  external Promise<T> f(T a);
}

extension XExtensions<T> on X<T> {
  Future<T> f(T a) {
    final Object t = this;
    final _X<T> tt = t;
    return promiseToFuture(tt.f(a));
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
       expectTranslate(`declare interface Y {
        a: number;
      }
      
      declare interface Z extends Y {
        f(): Promise<string>;
      }`).to.equal(`import "package:js/js_util.dart" show promiseToFuture;

@anonymous
@JS()
abstract class Y {
  external num get a;
  external set a(num v);
  external factory Y({num a});
}

@anonymous
@JS()
abstract class Z implements Y {}

@anonymous
@JS()
abstract class _Z {
  external Promise<String> f();
}

extension ZExtensions on Z {
  Future<String> f() {
    final Object t = this;
    final _Z tt = t;
    return promiseToFuture(tt.f());
  }
}

@JS()
abstract class Promise<T> {
  external factory Promise(
      void executor(void resolve(T result), Function reject));
  external Promise then(void onFulfilled(T result), [Function onRejected]);
}`);
     });
  it('handles interface properties with names that are invalid in Dart ', () => {
    expectTranslate(`interface X { '!@#$%^&*': string; }`).to.equal(`@anonymous
@JS()
abstract class X {
  /*external String get !@#$%^&*;*/
  /*external set !@#$%^&*(String v);*/
  external factory X();
}`);
    expectTranslate(`interface X { '5abcde': string; }`).to.equal(`@anonymous
@JS()
abstract class X {
  external String get JS$5abcde;
  external set JS$5abcde(String v);
  external factory X();
}`);
    expectTranslate(`interface X { '_wxyz': string; }`).to.equal(`@anonymous
@JS()
abstract class X {
  external String get JS$_wxyz;
  external set JS$_wxyz(String v);
  external factory X();
}`);
    expectTranslate(`interface X { 'foo_34_81$': string; }`).to.equal(`@anonymous
@JS()
abstract class X {
  external String get foo_34_81$;
  external set foo_34_81$(String v);
  external factory X({String foo_34_81$});
}`);
  });
});

describe('types with constructors', () => {
  describe('supports type literals with constructors', () => {
    it('simple', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}

declare var X: {
  prototype: XType,
  new(a: string, b: number): XType
};`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);
    });

    it('should make members of the literal type static ', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}

declare var X: {
  b: number;
  prototype: XType,
  new(a: string, b: number): XType
};`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external static num get b;
  external static set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);

      expectTranslate(`
interface C {
  oncached: (ev: Event) => any;
}
declare var C: {new(): C; CHECKING: number; }`)
          .to.equal(`import "dart:html" show Event;

@JS()
abstract class C {
  external dynamic Function(Event) get oncached;
  external set oncached(dynamic Function(Event) v);
  external factory C();
  external static num get CHECKING;
  external static set CHECKING(num v);
}`);
    });

    it('when possible, should merge the variable with an existing type of the same name', () => {
      expectTranslate(`
declare interface X {
  a: string;
  b: number;
  c(): boolean;
}

declare var X: {
  prototype: X,
  new(a: string, b: number): X
};`).to.equal(`@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);

      expectTranslate(`
declare interface X {
  a: string;
  b: number;
  c(): boolean;
}

declare var X: {
  b: number;
  prototype: X,
  new(a: string, b: number): X
};`).to.equal(`@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external static num get b;
  external static set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);

      expectTranslate(`
interface X { a: number; }
interface Y { c: number; }

declare var X: {prototype: X, new (): X, b: string};
declare var Y: {prototype: Y, new (): Y, d: string};
`).to.equal(`@JS()
abstract class X {
  external num get a;
  external set a(num v);
  external factory X();
  external static String get b;
  external static set b(String v);
}

@JS()
abstract class Y {
  external num get c;
  external set c(num v);
  external factory Y();
  external static String get d;
  external static set d(String v);
}`);
    });

    it('should support named type aliases of literals', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}


declare type Y = {
  prototype: XType,
  new(a: string, b: number): XType
}

declare var X: Y;
`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

@anonymous
@JS()
abstract class Y {
  // Skipping constructor from aliased type.
  /*new(String a, num b);*/
}

@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);
    });

    it('supports declarations within namespaces', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}

declare module m1 {
  declare var X: {
    prototype: XType,
    new(a: string, b: number): XType
  }
};`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

// Module m1
@JS("m1.X")
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory X(String a, num b);
}

// End module m1`);
    });
  });

  describe('supports interfaces with constructors', () => {
    it('simple', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}

declare interface X {
  new(a: string, b: number): XType;
}

declare var X: X;
`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);
    });

    it('should make members declared on the interface static ', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}

declare interface X {
  b: number;
  new(a: string, b: number): XType;
}

declare var X: X;
`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external static num get b;
  external static set b(num v);
  external bool c();
  external factory X(String a, num b);
}`);
    });

    it('should support type aliases', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}
declare type YType = XType;

declare interface X {
  new(a: string, b: number): YType;
}

declare var Y: X;
`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

/*declare type YType = XType;*/
@anonymous
@JS()
abstract class X {
  // Constructors on anonymous interfaces are not yet supported.
  /*external factory X(String a, num b);*/
}

@JS()
abstract class Y {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory Y(String a, num b);
}`);
    });

    it('supports being declared within a namespace', () => {
      expectTranslate(`
declare interface XType {
  a: string;
  b: number;
  c(): boolean;
}

declare module m1 {
  declare var X: {
    prototype: XType,
    new(a: string, b: number): XType
  }
};`).to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

// Module m1
@JS("m1.X")
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external factory X(String a, num b);
}

// End module m1`);
    });
  });

  describe('cases where a type and a variable cannot be merged', () => {
    it('should handle cases where an interface has no matching variable', () => {
      // Case where we cannot find a variable matching the interface so it is unsafe to give the
      // interface a constructor.
      expectTranslate(`
interface X {
  new (a: string|boolean, b: number): XType;
}`).to.equal(`@anonymous
@JS()
abstract class X {
  // Constructors on anonymous interfaces are not yet supported.
  /*external factory X(String|bool a, num b);*/
}`);
    });
  });
  it('should merge variables and interfaces with the same name by default', () => {
    expectTranslate(`
interface X {
  a: string;
  b: number;
  c(): boolean;
}

declare var X: { d: number[] };

declare var x: X;
`).to.equal(`@anonymous
@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external static List<num> get d;
  external static set d(List<num> v);
}

@JS()
external X get x;
@JS()
external set x(X v);`);
  });
});

describe('flags', () => {
  // If the lib.dom.d.ts file is compiled, it creates conflicting interface definitions which causes
  // a problem for variable declarations that we have merged into classes. The main problem was that
  // when the declaration transpiler performed the notSimpleBagOfProperties check, it was checking
  // the lib.dom.d.ts definition of the interface, which made it think the class didn't have a
  // constructor defined when in reality it did.
  it('does not compile DOM library files when the --generate-html flag is set', () => {
    const generateHTMLOpts = {failFast: true, generateHTML: true};
    expectTranslate(
        `declare var AbstractRange: {prototype: AbstractRange; new (): AbstractRange;};

            declare interface AbstractRange {
              readonly collapsed: boolean;
              readonly endOffset: number;
              readonly startOffset: number;
            }`,
        generateHTMLOpts)
        .to.equal(`@JS()
abstract class AbstractRange {
  external bool get collapsed;
  external num get endOffset;
  external num get startOffset;
  external factory AbstractRange();
}`);
  });

  describe('emitting properties of top level variables with anonymous types as static', () => {
    it('performs this by default', () => {
      expectTranslate(`
     declare interface CacheBase {
      readonly CHECKING: number;
      readonly DOWNLOADING: number;
      readonly IDLE: number;
    }
    
    declare interface MyCache extends CacheBase {}
    
    declare var MyCache: {
      prototype: MyCache;
      new (): MyCache;
      readonly CHECKING: number;
      readonly DOWNLOADING: number;
      readonly IDLE: number;
    };`).to.equal(`@anonymous
@JS()
abstract class CacheBase {
  external static num get CHECKING;
  external static num get DOWNLOADING;
  external static num get IDLE;
}

@JS()
abstract class MyCache implements CacheBase {
  external factory MyCache();
  external static num get CHECKING;
  external static num get DOWNLOADING;
  external static num get IDLE;
}`);
    });

    it('but not when the --explicit-static flag is set', () => {
      const explicitStaticOpts = {failFast: true, explicitStatic: true};
      expectTranslate(
          `
     declare interface CacheBase {
      readonly CHECKING: number;
      readonly DOWNLOADING: number;
      readonly IDLE: number;
    }
    
    declare interface MyCache extends CacheBase {}
    
    declare var MyCache: {
      prototype: MyCache;
      new (): MyCache;
      readonly CHECKING: number;
      readonly DOWNLOADING: number;
      readonly IDLE: number;
    };`,
          explicitStaticOpts)
          .to.equal(`@anonymous
@JS()
abstract class CacheBase {
  external num get CHECKING;
  external num get DOWNLOADING;
  external num get IDLE;
  external factory CacheBase({num CHECKING, num DOWNLOADING, num IDLE});
}

@JS()
abstract class MyCache implements CacheBase {
  external factory MyCache();
  external num get CHECKING;
  external num get DOWNLOADING;
  external num get IDLE;
}`);
    });
  });

  describe('--trust-js-types', () => {
    const trustJSTypesOpts = {failFast: true, trustJSTypes: true};
    it('makes classes that have neither constructors nor static members anonymous when set', () => {
      expectTranslate(
          `declare class X {
             a: number;
             b: string;
           }`,
          trustJSTypesOpts)
          .to.equal(`@anonymous
@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num get a;
  external set a(num v);
  external String get b;
  external set b(String v);
}`);
      expectTranslate(
          `declare class X {
             constructor();
             a: number;
             b: string;
           }`,
          trustJSTypesOpts)
          .to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
  external num get a;
  external set a(num v);
  external String get b;
  external set b(String v);
}`);
    });
    expectTranslate(
        `declare class X {
           static a: number;
           static b: string;
         }`,
        trustJSTypesOpts)
        .to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external static num get a;
  external static set a(num v);
  external static String get b;
  external static set b(String v);
}`);
  });

  describe('--rename-conflicting-types', () => {
    it('should merge variables and interfaces with the same name by default', () => {
      expectTranslate(`
interface X {
  a: string;
  b: number;
  c(): boolean;
}

declare var X: { d: number[] };

declare var x: X;
`).to.equal(`@anonymous
@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
  external static List<num> get d;
  external static set d(List<num> v);
}

@JS()
external X get x;
@JS()
external set x(X v);`);
    });

    it('should rename types that conflict with unrelated variables when the flag is set', () => {
      const renameConflictingTypesOpts = {failFast: true, renameConflictingTypes: true};
      expectTranslate(
          `interface X {
            a: string;
            b: number;
            c(): boolean;
          }

          declare var X: { a: number[], b: number[], c: number[] };

          declare var x: X;`,
          renameConflictingTypesOpts)
          .to.equal(`@anonymous
@JS()
abstract class XType {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external bool c();
}

@JS()
external dynamic /*{ a: number[], b: number[], c: number[] }*/ get X;
@JS()
external set X(dynamic /*{ a: number[], b: number[], c: number[] }*/ v);
@JS()
external XType get x;
@JS()
external set x(XType v);`);
    });
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
