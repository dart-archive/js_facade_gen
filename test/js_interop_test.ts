import {expectTranslate} from './test_support';

// TODO(jacobr): merge these tests back in with the other tests. These tests are
// only separate because we expected at one point to integrate with TS2Dart
// instead of refactoring TS2Dart to only output facades.
describe('variables', () => {
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
  it('support vardecls containing more than one type (implicit or explicit)', () => {
    expectTranslate('var a: A, b: B;').to.equal(`@JS()
external A get a;
@JS()
external set a(A v);
@JS()
external B get b;
@JS()
external set b(B v);`);
    expectTranslate('var a: number, b: string;').to.equal(`@JS()
external num get a;
@JS()
external set a(num v);
@JS()
external String get b;
@JS()
external set b(String v);`);
  });

  it('supports const', () => {
    expectTranslate('const a:number = 1;').to.equal(`@JS()
external num get a;`);

    expectTranslate('const a:number = 1, b:number = 2;').to.equal(`@JS()
external num get a;
@JS()
external num get b;`);

    expectTranslate('const a:string').to.equal(`@JS()
external String get a;`);

    expectTranslate('const a:number, b:number;').to.equal(`@JS()
external num get a;
@JS()
external num get b;`);
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
    it('ignore field initializers', () => {
      expectTranslate('class X { x: number = 42; }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num get x;
  external set x(num v);
}`);
    });
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
    it('does not support protected', () => {
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
      expectTranslate('class X { x(a, b); }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external x(a, b);
}`);
    });
    it('supports method return types', () => {
      expectTranslate('class X { x( a : number, b : string ) : num }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external num x(num a, String b);
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
    it('supports generic methods', () => {
      expectTranslate('class X<T> { static Z<T>(): X<T> {} }').to.equal(`@JS()
class X<T> {
  // @Ignore
  X.fakeConstructor$();
  external static X<dynamic /*T*/ > Z/*<T>*/();
}`);
      expectTranslate('class X<T> { Z(): X<T> {} }').to.equal(`@JS()
class X<T> {
  // @Ignore
  X.fakeConstructor$();
  external X<T> Z();
}`);
    });
    it('merge overrides', () => {
      expectTranslate(`
class X {
  createElement<T>(tagName: "img"): T;
  createElement<T>(tagName: "video"): T;
  createElement<T>(tagName: string): T;
}`).to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  /*external T createElement<T>('img' tagName);*/
  /*external T createElement<T>('video' tagName);*/
  /*external T createElement<T>(String tagName);*/
  external dynamic /*T*/ createElement/*<T>*/(
      String /*'img'|'video'|String*/ tagName);
}`);

      expectTranslate(`
class X {
  createElement<T>(tagName: "img"): T;
  createElement<T>(tagName: "video"): T;
  createElement<V>(tagName: string): V;
}`).to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  /*external T createElement<T>('img' tagName);*/
  /*external T createElement<T>('video' tagName);*/
  /*external V createElement<V>(String tagName);*/
  external dynamic /*T|V*/ createElement/*<T, V>*/(
      String /*'img'|'video'|String*/ tagName);
}`);

      expectTranslate(`
class X {
  createElement<T extends HTMLImageElement>(tagName: "img"): T;
  createElement<T extends HTMLVideoElement>(tagName: "video"): T;
  createElement<T extends Element>(tagName: string): T;
}`).to.equal(`import "dart:html" show ImageElement, VideoElement, Element;

@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  /*external T createElement<T extends ImageElement>('img' tagName);*/
  /*external T createElement<T extends VideoElement>('video' tagName);*/
  /*external T createElement<T extends Element>(String tagName);*/
  external dynamic /*T*/ createElement/*<T>*/(
      String /*'img'|'video'|String*/ tagName);
}`);

      expectTranslate(`export interface ScaleLinear<O> {
    (value: number): Output;
    domain(): Array<O>;
}

export function scaleLinear(): ScaleLinear<number>;
export function scaleLinear<O>(): ScaleLinear<O>;`)
          .to.equal(`@anonymous
@JS()
abstract class ScaleLinear<O> {
  external Output call(num value);
  external List<O> domain();
}

/*external ScaleLinear<num> scaleLinear();*/
/*external ScaleLinear<O> scaleLinear<O>();*/
@JS()
external ScaleLinear /*ScaleLinear<num>|ScaleLinear<O>*/ scaleLinear/*<O>*/();`);

      expectTranslate(`
class X {
  F(a: string): number;
  F(a: string, b: string|number): string;
  F(a2: string, b: string, c: number): string;
}`).to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  /*external num F(String a);*/
  /*external String F(String a, String|num b);*/
  /*external String F(String a2, String b, num c);*/
  external dynamic /*num|String*/ F(String a_a2,
      [dynamic /*String|num*/ b, num c]);
}`);

      expectTranslate(`
class X {
  Y(a: string): number {};
  Y(a: string, b: number):string {};
  Y(a2:string, b: string, c: number):string {};
}`).to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  /*external num Y(String a);*/
  /*external String Y(String a, num b);*/
  /*external String Y(String a2, String b, num c);*/
  external dynamic /*num|String*/ Y(String a_a2,
      [dynamic /*num|String*/ b, num c]);
}`);
      expectTranslate(`
class X {
  firstElement(elements: HTMLImageElement[]): HTMLImageElement;
  firstElement(elements: HTMLVideoElement[]): HTMLVideoElement;
  firstElement(elements: HTMLElement[]): HTMLElement;
}`).to.equal(`import "dart:html" show ImageElement, VideoElement, HtmlElement;

@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  /*external ImageElement firstElement(List<ImageElement> elements);*/
  /*external VideoElement firstElement(List<VideoElement> elements);*/
  /*external HtmlElement firstElement(List<HtmlElement> elements);*/
  external dynamic /*ImageElement|VideoElement|HtmlElement*/ firstElement(
      List<
          HtmlElement> /*List<ImageElement>|List<VideoElement>|List<HtmlElement>*/ elements);
}`);

      // TODO(jacobr): we should consider special casing so EventLister and
      // EventListenerObject are treated as the same in Dart even though they
      // are different.
      expectTranslate(`
interface SampleAudioNode {
  addEventListener(type: "ended", listener: (ev: Event) => any, useCapture?: boolean): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}`).to.equal(`import "dart:html" show Event;

@anonymous
@JS()
abstract class SampleAudioNode {
  /*external void addEventListener('ended' type, dynamic listener(Event ev), [bool useCapture]);*/
  /*external void addEventListener(String type, EventListener|EventListenerObject listener, [bool useCapture]);*/
  external void addEventListener(String /*'ended'|String*/ type,
      dynamic /*dynamic Function(Event)|EventListener|EventListenerObject*/ listener,
      [bool useCapture]);
}`);

      expectTranslate(`
interface ListenObject {
    someDummyMethod(evt: string): void;
}

interface ExampleListener {
    (evt: string): void;
}

interface DummySample {
  addEventListener(type: 'ended', listener: ListenObject): void;
  addEventListener(type: string, listener: ExampleListener): void;
}`).to.equal(`@anonymous
@JS()
abstract class ListenObject {
  external void someDummyMethod(String evt);
}

typedef void ExampleListener(String evt);

@anonymous
@JS()
abstract class DummySample {
  /*external void addEventListener('ended' type, ListenObject listener);*/
  /*external void addEventListener(String type, ExampleListener listener);*/
  external void addEventListener(String /*'ended'|String*/ type,
      dynamic /*ListenObject|ExampleListener*/ listener);
}`);

      expectTranslate(`
interface ListenAny {
    (evt: any): void;
}

interface ExampleListener {
    (evt: string): void;
}

interface DummySample {
  addEventListener(type: 'ended', listener: ListenAny): void;
  addEventListener(type: string, listener: ExampleListener): void;
}`).to.equal(`typedef void ListenAny(dynamic evt);
typedef void ExampleListener(String evt);

@anonymous
@JS()
abstract class DummySample {
  /*external void addEventListener('ended' type, ListenAny listener);*/
  /*external void addEventListener(String type, ExampleListener listener);*/
  external void addEventListener(String /*'ended'|String*/ type,
      Function /*ListenAny|ExampleListener*/ listener);
}`);
    });
    it('dot dot dot', () => {
      expectTranslate(`
function buildName(firstName: string, ...restOfName: string[]): string;
`).to.equal(`@JS()
external String buildName(String firstName,
    [String restOfName1,
    String restOfName2,
    String restOfName3,
    String restOfName4,
    String restOfName5]);`);
      expectTranslate(`
function log(...args);`)
          .to.equal(`@JS()
external log([args1, args2, args3, args4, args5]);`);
    });
    it('property bag interfaces', () => {
      expectTranslate(`
interface X {
  a: string;
  b: number;
  c: X;
}
interface Y extends X {
  d: number;
  /* example comment */
  e: any;
}`).to.equal(`@anonymous
@JS()
abstract class X {
  external String get a;
  external set a(String v);
  external num get b;
  external set b(num v);
  external X get c;
  external set c(X v);
  external factory X({String a, num b, X c});
}

@anonymous
@JS()
abstract class Y implements X {
  external num get d;
  external set d(num v);

  /// example comment
  external dynamic get e;
  external set e(dynamic v);
  external factory Y({num d, dynamic e, String a, num b, X c});
}`);
      expectTranslate(`interface X<A> { a: A; b: num, c: X }
             interface Y<A,B> extends X<A> { d: B; e: any; }`)
          .to.equal(`@anonymous
@JS()
abstract class X<A> {
  external A get a;
  external set a(A v);
  external num get b;
  external set b(num v);
  external X get c;
  external set c(X v);
  external factory X({A a, num b, X c});
}

@anonymous
@JS()
abstract class Y<A, B> implements X<A> {
  external B get d;
  external set d(B v);
  external dynamic get e;
  external set e(dynamic v);
  external factory Y({B d, dynamic e, A a, num b, X c});
}`);
    });
    it('callable', () => {
      expectTranslate('interface X<T> { (a:T):T; Y():T; }').to.equal(`@anonymous
@JS()
abstract class X<T> {
  external T call(T a);
  external T Y();
}`);
    });

    it('supports constructors', () => {
      expectTranslate('class X { constructor() { } }').to.equal(`@JS()
class X {
  // @Ignore
  X.fakeConstructor$();
  external factory X();
}`);
    });
    it('supports parameter properties', () => {
      expectTranslate(`
class X {
  c: number;
  constructor(private _bar: B, public foo: string = "hello", private _goggles: boolean = true);
}`).to.equal(`@JS()
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
      expectTranslate(`
class X {
  constructor(public foo: string, b: number, private _marbles: boolean = true) {}
}`).to.equal(`@JS()
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
  it('empty enum', () => {
    expectTranslate('enum Color { }').to.equal(`@JS()
class Color {}`);
  });
  it('enum with initializer', () => {
    expectTranslate('enum Color { Red = 1, Green, Blue = 4 }').to.equal(`@JS()
class Color {
  external static num get Red;
  external static num get Green;
  external static num get Blue;
}`);
  });
});

describe('renames', () => {
  it('should support class renames', () => {
    expectTranslate(`
declare namespace m1 {
  interface A { x(); }
}
declare namespace m2 {
  interface A { y(); }
}
`).to.equal(`// Module m1
@anonymous
@JS()
abstract class A {
  external x();
}

// End module m1

// Module m2
@anonymous
@JS()
abstract class m2_A {
  external y();
}

// End module m2`);
    expectTranslate(`
    declare namespace foo.m1 {
      function x(): number;
    }
    declare namespace foo.m2 {
      function x(): string;
    }
    declare namespace m2 {
      function x(): string[];
    }`).to.equal(`// Module foo.m1
@JS("foo.m1.x")
external num x();
// End module foo.m1

// Module foo.m2
@JS("foo.m2.x")
external String m2_x();
// End module foo.m2

// Module m2
@JS("m2.x")
external List<String> x2();
// End module m2`);
    expectTranslate(`
declare namespace m1 {
  class A { constructor(x); }
}
declare namespace m2 {
  class A { constructor(y); }
}`).to.equal(`// Module m1
@JS("m1.A")
class A {
  // @Ignore
  A.fakeConstructor$();
  external factory A(x);
}

// End module m1

// Module m2
@JS("m2.A")
class m2_A {
  // @Ignore
  m2_A.fakeConstructor$();
  external factory m2_A(y);
}

// End module m2`);
    expectTranslate(`
declare namespace m1 {
  class A { constructor(x:m2.A); }
}
declare namespace m2 {
  class A { constructor(y:m1.A); }
}
`).to.equal(`// Module m1
@JS("m1.A")
class A {
  // @Ignore
  A.fakeConstructor$();
  external factory A(m2_A x);
}

// End module m1

// Module m2
@JS("m2.A")
class m2_A {
  // @Ignore
  m2_A.fakeConstructor$();
  external factory m2_A(A y);
}

// End module m2`);
  });
  it('should support member renames', () => {
    expectTranslate(`
declare namespace m1 {
  interface A { x(); }
}
declare namespace m2 {
  export function A(x:m1.A);
}`).to.equal(`// Module m1
@anonymous
@JS()
abstract class A {
  external x();
}

// End module m1

// Module m2
@JS("m2.A")
external m2_A(A x);
// End module m2`);
  });

  it('handle class renames in type declarations', () => {
    expectTranslate(`
declare namespace m1 {
  interface A { x(); }
}
declare namespace m2 {
  interface A { y(); }
}
export function register(x:m2.A);
`).to.equal(`// Module m1
@anonymous
@JS()
abstract class A {
  external x();
}

// End module m1

// Module m2
@anonymous
@JS()
abstract class m2_A {
  external y();
}

// End module m2
@JS()
external register(m2_A x);`);
    expectTranslate(`
declare namespace m1 {
  namespace foo {
    interface A { x(); }
  }
}
declare namespace m2 {
  namespace foo {
    interface A { y(); }
  }
}
declare namespace m3 {
  namespace foo {
    interface A { z(); }
  }
}
export function register(y:m2.foo.A, z:m3.foo.A);
`).to.equal(`// Module m1

// Module foo
@anonymous
@JS()
abstract class A {
  external x();
}

// End module foo

// End module m1

// Module m2

// Module foo
@anonymous
@JS()
abstract class foo_A {
  external y();
}

// End module foo

// End module m2

// Module m3

// Module foo
@anonymous
@JS()
abstract class m3_foo_A {
  external z();
}

// End module foo

// End module m3
@JS()
external register(foo_A y, m3_foo_A z);`);

    expectTranslate(`
declare namespace m1 {
  interface A { x(); }
}
declare namespace m2 {
  interface A { y(); }
}
export function register(x:m1.A);
    `).to.equal(`// Module m1
@anonymous
@JS()
abstract class A {
  external x();
}

// End module m1

// Module m2
@anonymous
@JS()
abstract class m2_A {
  external y();
}

// End module m2
@JS()
external register(A x);`);
  });

  describe('type alias', () => {
    it('replace with simple type', () => {
      expectTranslate(`
type MyNumber = number;
export function add(x: MyNumber, y: MyNumber): MyNumber;
        `).to.equal(`/*type MyNumber = number;*/
@JS()
external num add(num x, num y);`);
    });
  });

  it('union types', () => {
    // TODO(jacobr): we should resolve that listener1 and listener2 are both functions.

    // TODO(jacobr): ideally the draw method should specify that arg el has type
    // HtmlElement instead of dynamic.
    expectTranslate(`
type listener1 = ()=>boolean;
type listener2 = (e:string)=>boolean;
function addEventListener(listener: listener1|listener2);`)
        .to.equal(`typedef bool listener1();
typedef bool listener2(String e);
@JS()
external addEventListener(dynamic /*listener1|listener2*/ listener);`);

    expectTranslate('function draw(el: HTMLCanvasElement|HTMLImageElement):void;')
        .to.equal(`import "dart:html" show CanvasElement, ImageElement;

@JS()
external void draw(dynamic /*CanvasElement|ImageElement*/ el);`);
  });

  it('callback this type', () => {
    expectTranslate(`
function addEventListener(type: string, listener: (this: Element, event: Event) => void);`)
        .to.equal(`import "dart:html" show Element, Event;

@JS()
external addEventListener(
    String type, void listener(/*Element this*/ Event event));`);
    expectTranslate(`
function addEventListener(type: 'load', listener: (this: HTMLImageElement, event: Event) => void);
function addEventListener(type: string, listener: (this: Element, event: Event) => void);
`).to.equal(`import "dart:html" show ImageElement, Event, Element;

/*external addEventListener('load' type, void listener(ImageElement JS$this, Event event));*/
/*external addEventListener(
    String type, void listener(Element JS$this, Event event));
*/
@JS()
external addEventListener(
    String /*'load'|String*/ type, void listener(/*Element this*/ Event event));`);
  });
});
