import {expectTranslate} from './test_support';

describe('types', () => {
  it('supports qualified names', () => {
    expectTranslate('var x: foo.Bar;').to.equal(`@JS()
external foo.Bar get x;
@JS()
external set x(foo.Bar v);`);
  });

  it('supports null types', () => {
    expectTranslate('export function attr(name: string, value: null);').to.equal(`@JS()
external attr(String name, Null value);`);

    expectTranslate(`export function style(name: string, priority?: 'regular' | 'important');`)
        .to.equal(`@JS()
external style(String name, [String /*'regular'|'important'*/ priority]);`);

    expectTranslate(`export function style(name: string, priority?: null | 'important');`)
        .to.equal(`@JS()
external style(String name, [String /*Null|'important'*/ priority]);`);
    expectTranslate('var foo: null;').to.equal(`@JS()
external Null get foo;
@JS()
external set foo(Null v);`);
  });
  it('supports this return type', () => {
    expectTranslate('export interface Foo { bar() : this; }').to.equal(`@anonymous
@JS()
abstract class Foo {
  external Foo bar();
}`);
  });
  it('supports true and false return types', () => {
    expectTranslate('export function f(): true;').to.equal(`@JS()
external bool /*true*/ f();`);
    expectTranslate('export function g(): false;').to.equal(`@JS()
external bool /*false*/ g();`);
  });

  it('comment type literals', () => {
    expectTranslate('var x: {x: string, y: number};').to.equal(`@JS()
external dynamic /*{x: string, y: number}*/ get x;
@JS()
external set x(dynamic /*{x: string, y: number}*/ v);`);
  });
  it('do not translates string index signatures to dartisms', () => {
    // We wish these could be just Map<String, dynamic> but sadly can't support
    // that yet.
    expectTranslate('var x: {[k: string]: any[]};').to.equal(`@JS()
external dynamic /*JSMap of <String,List<dynamic>>*/ get x;
@JS()
external set x(dynamic /*JSMap of <String,List<dynamic>>*/ v);`);
    expectTranslate('var x: {[k: number]: number};').to.equal(`@JS()
external dynamic /*JSMap of <num,num>*/ get x;
@JS()
external set x(dynamic /*JSMap of <num,num>*/ v);`);
  });
  it('drops type literals with index signatures and other properties', () => {
    expectTranslate('var x: {a: number, [k: string]: number};').to.equal(`@JS()
external dynamic /*{a: number, [k: string]: number}*/ get x;
@JS()
external set x(dynamic /*{a: number, [k: string]: number}*/ v);`);
  });

  it('should support union types', () => {
    expectTranslate('function foo() : number | number[];').to.equal(`@JS()
external dynamic /*num|List<num>*/ foo();`);
    expectTranslate('var x: number|Array<string>;').to.equal(`@JS()
external dynamic /*num|List<String>*/ get x;
@JS()
external set x(dynamic /*num|List<String>*/ v);`);
    expectTranslate('function x(): number|Array<{[k: string]: any}> {};').to.equal(`@JS()
external dynamic /*num|List<JSMap of <String,dynamic>>*/ x();`);
  });

  it('should support intersection types', () => {
    expectTranslate(`
interface Foo { a: number, b: string }
interface Bar { b: string }

function foo() : Foo & Bar;
`).to.equal(`@anonymous
@JS()
abstract class Foo {
  external num get a;
  external set a(num v);
  external String get b;
  external set b(String v);
  external factory Foo({num a, String b});
}

@anonymous
@JS()
abstract class Bar {
  external String get b;
  external set b(String v);
  external factory Bar({String b});
}

@JS()
external Foo /*Foo&Bar*/ foo();`);
  });

  it('should support parenthesized types', () => {
    expectTranslate('function foo() : (number | number[]);').to.equal(`@JS()
external dynamic /*num|List<num>*/ foo();`);
    expectTranslate('var x: (number|Array<string>);').to.equal(`@JS()
external dynamic /*num|List<String>*/ get x;
@JS()
external set x(dynamic /*num|List<String>*/ v);`);
    expectTranslate('function x(): number|(Array<{[k: string]: any}>) {};').to.equal(`@JS()
external dynamic /*num|List<JSMap of <String,dynamic>>*/ x();`);
  });

  it('should support array types', () => {
    expectTranslate('var x: string[] = [];').to.equal(`@JS()
external List<String> get x;
@JS()
external set x(List<String> v);`);
  });
  it('should support function types', () => {
    expectTranslate('var x: (a: string) => string;').to.equal(`@JS()
external String Function(String) get x;
@JS()
external set x(String Function(String) v);`);

    expectTranslate('declare var a: Function').to.equal(`@JS()
external Function get a;
@JS()
external set a(Function v);`);
  });

  describe('TypeScript utility types and other mapped types', () => {
    it('emits X in place of Partial<X> since all Dart types are currently nullable', () => {
      expectTranslate('interface X { a: number; } declare const x: Partial<X>;')
          .to.equal(`@anonymous
@JS()
abstract class X {
  external num get a;
  external set a(num v);
  external factory X({num a});
}

@JS()
external X /*Partial<X>*/ get x;`);
    });

    it('treats other mapped types as dynamic', () => {
      expectTranslate(`interface Todo {
        task: string;
      }
    
      type ReadonlyTodo = {
        readonly[P in keyof Todo]: Todo[P];
      }
      
      declare const todo: ReadonlyTodo;`)
          .to.equal(`@anonymous
@JS()
abstract class Todo {
  external String get task;
  external set task(String v);
  external factory Todo({String task});
}

/*
 Warning: Mapped types are not supported in Dart. Uses of this type will be replaced by dynamic.
type ReadonlyTodo = {
        readonly[P in keyof Todo]: Todo[P];
      }
*/
@JS()
external dynamic /*ReadonlyTodo*/ get todo;`);
    });
  });

  it('should support conditional types', () => {
    expectTranslate(`
type TypeName<T> = T extends string ? "string" :
T extends string ? "string" :
T extends number ? "number" :
T extends boolean ? "boolean" :
T extends undefined ? "undefined" :
T extends Function ? "function" :
"object";

declare var x: TypeName<number>;
declare var y: TypeName<string>;
declare var z: TypeName<boolean>;`)
        .to.equal(
            `/*Warning: Conditional types are not supported in Dart. Uses of this type will be replaced by dynamic.
type TypeName<T> = T extends string ? "string" :
T extends string ? "string" :
T extends number ? "number" :
T extends boolean ? "boolean" :
T extends undefined ? "undefined" :
T extends Function ? "function" :
"object";
*/
@JS()
external dynamic /*TypeName<num>*/ get x;
@JS()
external set x(dynamic /*TypeName<num>*/ v);
@JS()
external dynamic /*TypeName<String>*/ get y;
@JS()
external set y(dynamic /*TypeName<String>*/ v);
@JS()
external dynamic /*TypeName<bool>*/ get z;
@JS()
external set z(dynamic /*TypeName<bool>*/ v);`);
  });
});

describe('type arguments', () => {
  it('should support declaration', () => {
    expectTranslate('class X<A, B> { a: A; }').to.equal(`@JS()
class X<A, B> {
  // @Ignore
  X.fakeConstructor$();
  external A get a;
  external set a(A v);
}`);
  });
  it('should support nested extends', () => {
    expectTranslate('class X<A extends B<C>> { }').to.equal(`@JS()
class X<A extends B<C>> {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('should multiple extends', () => {
    expectTranslate('class X<A extends A1, B extends B1> { }').to.equal(`@JS()
class X<A extends A1, B extends B1> {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('should support use', () => {
    expectTranslate('class X extends Y<A, B> { }').to.equal(`@JS()
class X extends Y<A, B> {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
  });
  it('should handle <void> and <Null> generic arguments', () => {
    expectTranslate('var x: X<number>;').to.equal(`@JS()
external X<num> get x;
@JS()
external set x(X<num> v);`);
    expectTranslate('class X extends Y<void> { }').to.equal(`@JS()
class X extends Y<void> {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
    expectTranslate('class X extends Y<void, string> { }').to.equal(`@JS()
class X extends Y<void, String> {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
    expectTranslate('var z : Y<Null, string>;').to.equal(`@JS()
external Y<Null, String> get z;
@JS()
external set z(Y<Null, String> v);`);
    expectTranslate('var z : Y<void, string, void>;').to.equal(`@JS()
external Y<void, String, void> get z;
@JS()
external set z(Y<void, String, void> v);`);
  });

  it('should create class for type alias literals', () => {
    expectTranslate(`/**
 * Event Parameters.
 */
export type EventParameters = {
    bubbles: boolean;
    /**
     * Is cancelable.
     */
    cancelable: boolean;
};

export function dispatch(parameters: EventParameters): void;`)
        .to.equal(`/// Event Parameters.
@anonymous
@JS()
abstract class EventParameters {
  external bool get bubbles;
  external set bubbles(bool v);

  /// Is cancelable.
  external bool get cancelable;
  external set cancelable(bool v);
  external factory EventParameters({bool bubbles, bool cancelable});
}

@JS()
external void dispatch(EventParameters parameters);`);

    expectTranslate(`/**
 * Event Parameters.
 */
export type EventParameters<T> = {
    bubbles: T;
    /**
     * Is cancelable.
     */
    cancelable: T;
};

export function dispatch(parameters: EventParameters<string>): void;`)
        .to.equal(`/// Event Parameters.
@anonymous
@JS()
abstract class EventParameters<T> {
  external T get bubbles;
  external set bubbles(T v);

  /// Is cancelable.
  external T get cancelable;
  external set cancelable(T v);
  external factory EventParameters({T bubbles, T cancelable});
}

@JS()
external void dispatch(EventParameters<String> parameters);`);
  });

  it('should create typedef for type alias function literals', () => {
    expectTranslate(`
export type ValueFn<A, B, T> = (this: T, a: A, b: B) => A;

export type SimpleValueFn<A, B> = (a: A, b: B) => A;

export function dispatch(callback: ValueFn<string, number, Element>): void;
export function dispatchSimple(callback: SimpleValueFn<string, number>): void;`)
        .to.equal(`import "dart:html" show Element;

typedef A ValueFn<A, B, T>(/*T this*/ A a, B b);
typedef A SimpleValueFn<A, B>(A a, B b);
@JS()
external void dispatch(ValueFn<String, num, Element> callback);
@JS()
external void dispatchSimple(SimpleValueFn<String, num> callback);`);
  });

  it('should handle generic parameters on non dart compatible type aliases', () => {
    expectTranslate(`
    export type Triangle<G> = [G, G, G];
    export type ListOfLists<G> = [G[]];

    export function triangles<T>(): Triangle<T>[];
`).to.equal(`/*export type Triangle<G> = [G, G, G];*/
/*export type ListOfLists<G> = [G[]];*/
@JS()
external List<List<dynamic /*T*/ > /*Tuple of <T,T,T>*/ > triangles/*<T>*/();`);
  });

  it('supports the keyof operator and the indexed access operator', () => {
    expectTranslate(`export interface A {
      a: number;
    }
    export function f<K extends keyof A>(first: K, second: A[K]): boolean;`)
        .to.equal(`@anonymous
@JS()
abstract class A {
  external num get a;
  external set a(num v);
  external factory A({num a});
}

@JS()
external bool f/*<K extends keyof A>*/(
    dynamic /*K*/ first, dynamic /*A[K]*/ second);`);
  });
});
