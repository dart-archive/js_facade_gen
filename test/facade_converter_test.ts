import {expectTranslate, FAKE_MAIN} from './test_support';

function getSources(str: string): {[k: string]: string} {
  let srcs: {[k: string]: string} = {
    'other.ts': `
        export class X {
          map(x: number): string { return String(x); }
          static get(m: any, k: string): number { return m[k]; }
        }
    `,
  };
  srcs[FAKE_MAIN] = str;
  return srcs;
}

const COMPILE_OPTS = {
  translateBuiltins: true,
  failFast: true,
  typingsRoot: 'some/path/to/typings/',
};

function expectWithTypes(str: string) {
  return expectTranslate(getSources(str), COMPILE_OPTS);
}

describe('type based translation', () => {
  describe('Dart type substitution', () => {
    describe('finds registered substitutions', () => {
      it('for dart:html types by default', () => {
        expectWithTypes('const n: Node;').to.equal(`import "dart:html" show Node;

@JS()
external Node get n;`);

        expectWithTypes('const xhr: XMLHttpRequest;').to.equal(`import "dart:html" show HttpRequest;

@JS()
external HttpRequest get xhr;`);
      });

      it('but does not import dart:html types when the flag is set', () => {
        const generateHTMLOpts = Object.assign({}, COMPILE_OPTS, {generateHTML: true});
        expectTranslate('const n: Node', generateHTMLOpts).to.equal(`@JS()
external Node get n;`);

        expectTranslate(
            `interface XMLHttpRequest {
              readonly readyState: number;
              readonly response: any;
              readonly responseText: string;
              readonly DONE: number;
              readonly HEADERS_RECEIVED: number;
              readonly LOADING: number;
              readonly OPENED: number;
              readonly UNSENT: number;
            }
        
            const xhr: XMLHttpRequest`,
            generateHTMLOpts)
            .to.equal(`@anonymous
@JS()
abstract class XMLHttpRequest {
  external num get readyState;
  external dynamic get response;
  external String get responseText;
  external num get DONE;
  external num get HEADERS_RECEIVED;
  external num get LOADING;
  external num get OPENED;
  external num get UNSENT;
  external factory XMLHttpRequest(
      {num readyState,
      dynamic response,
      String responseText,
      num DONE,
      num HEADERS_RECEIVED,
      num LOADING,
      num OPENED,
      num UNSENT});
}

@JS()
external XMLHttpRequest get xhr;`);
      });

      it('finds other registered type substitutions', () => {
        expectWithTypes('const intArray: Uint8Array;')
            .to.equal(`import "dart:typed_data" show Uint8List;

@JS()
external Uint8List get intArray;`);
        expectWithTypes('const buff: ArrayBuffer;')
            .to.equal(`import "dart:typed_data" show ByteBuffer;

@JS()
external ByteBuffer get buff;`);

        expectWithTypes('const n: Number;').to.equal(`@JS()
external num get n;`);

        expectWithTypes('const s: String;').to.equal(`@JS()
external String get s;`);

        expectWithTypes('const s: string;').to.equal(`@JS()
external String get s;`);

        expectWithTypes('const b: Boolean;').to.equal(`@JS()
external bool get b;`);
      });
    });

    it('allows undeclared types', () => {
      expectWithTypes('const t: Thing;').to.equal(`@JS()
external Thing get t;`);
    });
  });

  describe('skip top level calls', () => {
    it('console.log', () => {
      expectWithTypes(`console.log(1);`).to.equal('');
      expectWithTypes(`console.log(1, 2);`).to.equal('');
    });
  });

  describe('const', () => {
    it('simple', () => {
      expectWithTypes('const x = 1;').to.equal(`@JS()
external get x;`);
      expectWithTypes('const x = [];').to.equal(`@JS()
external get x;`);
      expectWithTypes(
          'class Person {}' +
          'const x = new Person();')
          .to.equal(`@JS()
class Person {
  // @Ignore
  Person.fakeConstructor$();
}

@JS()
external get x;`);
    });
  });

  describe('readonly', () => {
    it('simple', () => {
      expectWithTypes(`export class Person {
  readonly x: number;
  readonly y: string;
  readonly z: boolean;
}`).to.equal(`@JS()
class Person {
  // @Ignore
  Person.fakeConstructor$();
  external num get x;
  external String get y;
  external bool get z;
}`);
    });
  });

  it('translates array façades', () => {
    expectWithTypes('function f() : string[] {}').to.equal(`@JS()
external List<String> f();`);

    expectWithTypes(`export interface DSVParsedArray<T> extends Array<T> {
 columns: Array<string>;
}`).to.equal(`@anonymous
@JS()
abstract class DSVParsedArray<T> implements List<T> {
  external List<String> get columns;
  external set columns(List<String> v);
}`);
  });


  it('translates readonly array façades', () => {
    expectWithTypes('declare const a : ReadonlyArray<number>;').to.equal(`@JS()
external List<num> /*ReadonlyArray<num>*/ get a;`);
    expectWithTypes('function f() : ReadonlyArray<string> {}').to.equal(`@JS()
external List<String> /*ReadonlyArray<String>*/ f();`);
  });

  describe('error detection', () => {
    it('supports imports', () => {
      expectWithTypes(`import {X} from "other";\nlet x:X;`).to.equal(`import "other.dart" show X;

@JS()
external X get x;
@JS()
external set x(X v);`);
    });
  });

  describe('special identifiers', () => {
    it('preserves names that begin with two underscores', () => {
      expectWithTypes(`export function f(__a: number): boolean;
export function f(__a: string): boolean;`)
          .to.equal(`/*external bool f(num JS$__a);*/
/*external bool f(String JS$__a);*/
@JS()
external bool f(dynamic /*num|String*/ JS$__a);`);
    });

    it('preserves names that begin with one underscore', () => {
      expectWithTypes(`export function f(_a: number): boolean;
export function f(_a: string): boolean;`)
          .to.equal(`/*external bool f(num JS$_a);*/
/*external bool f(String JS$_a);*/
@JS()
external bool f(dynamic /*num|String*/ JS$_a);`);
    });
  });
});
