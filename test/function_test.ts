import {expectTranslate} from './test_support';

describe('functions', () => {
  it('supports declarations', () => {
    expectTranslate('function x() {}').to.equal(`@JS()
external x();`);
  });
  it('hide param default values', () => {
    expectTranslate('function x(a = 42, b = 1) { return 42; }').to.equal(`@JS()
external x([a, b]);`);
    expectTranslate('function x(p1, a = 42, b = 1, p2) { return 42; }').to.equal(`@JS()
external x(p1, [a, b, p2]);`);
  });
  it('translates optional parameters', () => {
    expectTranslate('function x(a?: number, b?: number) { return 42; }').to.equal(`@JS()
external x([num a, num b]);`);
    expectTranslate('function x(p1, a?: number, b?: number, p2) { return 42; }').to.equal(`@JS()
external x(p1, [num a, num b, p2]);`);
  });
  it('supports empty returns', () => {
    expectTranslate('function x() { return; }').to.equal(`@JS()
external x();`);
  });

  it('supports type predicates', () => {
    expectTranslate('function isArrayBuffer(value?: any): value is ArrayBuffer;')
        .to.equal(`import "dart:typed_data" show ByteBuffer;

@JS()
external bool /*value is ByteBuffer*/ isArrayBuffer([dynamic value]);`);
  });

  it('polyfill var args', () => {
    expectTranslate('function x(...a: number[]) { return 42; }').to.equal(`@JS()
external x([num a1, num a2, num a3, num a4, num a5]);`);
  });
  it('supports function parameters', () => {
    expectTranslate('function f(fn: (a: A, b: B) => C) {}').to.equal(`@JS()
external f(C fn(A a, B b));`);
  });
  it('supports recursive function parameters', () => {
    expectTranslate('function f(fn: (a: (b: B) => C) => D) {}').to.equal(`@JS()
external f(D fn(C a(B b)));`);
  });
  it('supports generic-typed function parameters', () => {
    expectTranslate('function f<T, U>(fn: (a: T, b: U) => T) {}').to.equal(`@JS()
external f/*<T, U>*/(dynamic /*T*/ fn(dynamic /*T*/ a, dynamic /*U*/ b));`);
  });
  it('translates functions taking rest parameters to untyped Function', () => {
    expectTranslate('function f(fn: (...a: string[]) => number) {}').to.equal(`@JS()
external f(Function /*(...a: string[]) => number*/ fn);`);
  });
});

/* TODO(jacobr): support named parameters.
describe('named parameters', () => {
  it('supports named parameters', () => {
    expectTranslate('function x({a = "x", b}) { return a + b;
}').to.equal(`x({a: "x", b}) { return a + b;
}`);
  });
  it('supports types on named parameters', () => {
    expectTranslate('function x({a = 1, b = 2}: {a: number, b: number} = {}) {
return a + b;
}').to.equal(`x({num a: 1, num b: 2}) {
  return a + b;
}`);
  });
  it('supports reference types on named parameters', () => {
    expectTranslate(
        'interface Args { a: string; b: number }\n' +
            'function x({a, b, c}: Args) { return a + b; }')
        .to.equal(`abstract class Args {
  String a;
  num b;
}

x({String a, num b, c}) {
  return a + b;
}`);
  });
  it('supports declared, untyped named parameters', () => {
    expectTranslate('function x({a, b}: {a: number, b}) { return a + b;
}').to.equal(`x({num a, b})
{
  return a + b;
}`);
  });
  it('fails for non-property types on named parameters', () => {
    expectErroneousCode(
        'interface X { a(a: number); }\n' +
            'function x({a}: X) { return a + b; }')
        .to.throw('X.a used for named parameter definition must be a property');
  });
});
*/

describe('generic functions', () => {
  it('supports generic types', () => {
    expectTranslate('function sort<T, U>(xs: T[]): T[] { return xs; }').to.equal(`@JS()
external List<dynamic /*T*/ > sort/*<T, U>*/(List<dynamic /*T*/ > xs);`);
  });
  it('replaces type usage sites, but not idents', () => {
    expectTranslate(`function wobble<T, U>(u: U): T { }`).to.equal(`@JS()
external dynamic /*T*/ wobble/*<T, U>*/(dynamic /*U*/ u);`);
  });
  it('translates generic calls', () => {
    expectTranslate(`function wobble<T>(foo: T): T { }`).to.equal(`@JS()
external dynamic /*T*/ wobble/*<T>*/(dynamic /*T*/ foo);`);
  });
});
