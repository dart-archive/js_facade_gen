import {ConvertedSyntaxKind} from '../../lib/json/converted_syntax_kinds';
import {TranspilerOptions} from '../../lib/main';
import {expectTranslate, FAKE_MAIN} from '../test_support';

function getSources(str: string): Map<string, string> {
  const srcs: Map<string, string> = new Map(Object.entries({
    'demo/some/other.d.ts': `
        export class X {
            toString(x: number): string;
        }
        export interface Y {
            f(a: number): number;
            g(a: string): boolean;
        }`
  }));
  srcs.set(FAKE_MAIN, str);
  return srcs;
}

const OPTS: TranspilerOptions = {
  failFast: true,
  toJSON: true,
};

export function prettyStringify(object: object) {
  return JSON.stringify(object, undefined, 2);
}

export function expectTranslateJSON(str: string, options: TranspilerOptions = OPTS) {
  return expectTranslate(str, options);
}

export function expectWithExports(str: string) {
  return expectTranslate(getSources(str), OPTS);
}

export function expectKeywordType(typeName: string):
    {kind: ConvertedSyntaxKind.KeywordType, typeName: string} {
  return {kind: ConvertedSyntaxKind.KeywordType, typeName};
}
