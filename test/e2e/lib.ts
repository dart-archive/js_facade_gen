export class MyClass {
  private error: string = 'error';
  constructor(private ctorField: string) {}

  get field(): string {
    // TODO: TypeScript doesn't parse the RHS as StringKeyword so we lose
    // the translation of string -> String.
    // We use capital S String here, even though it wouldn't run in TS.
    if ((<any>' world') instanceof String) {
      return this.ctorField + ' world';
    } else {
      return this.error;
    }
  }

  namedParam({x = '?'}: any = {}) { return 'hello' + x; }
}

interface Observer {
  update(o: Object, arg: Object);
}

export class MySubclass extends MyClass implements Observer {
  constructor(ctorField: string) { super(ctorField); }
  get subclassField(): string { return this.field; }
  update(o: Object, arg: Object) { this.field = arg.toString(); }
}

export const SOME_ARRAY = [1, 2, 3];
export const someArray = SOME_ARRAY;
