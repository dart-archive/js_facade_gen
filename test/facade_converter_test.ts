import {expectTranslate, FAKE_MAIN} from './test_support';

function getSources(str: string): {[k: string]: string} {
  let srcs: {[k: string]: string} = {
    'other.ts': `
        export class X {
          map(x: number): string { return String(x); }
          static get(m: any, k: string): number { return m[k]; }
        }
        export class Promise {}
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
    it('finds registered substitutions', () => {
      expectWithTypes('const n: Node;').to.equal(`import "dart:html" show Node;

@JS()
external Node get n;`);
      expectWithTypes('const xhr: XMLHttpRequest;').to.equal(`import "dart:html" show HttpRequest;

@JS()
external HttpRequest get xhr;`);
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

  describe('error detection', () => {
    it('supports imports', () => {
      expectWithTypes(`import {X} from "other";\nlet x:X;`).to.equal(`import "other.dart" show X;

@JS()
external X get x;
@JS()
external set x(X v);`);
    });
  });
});
