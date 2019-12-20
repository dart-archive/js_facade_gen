import {ConvertedSyntaxKind} from '../../../lib/json/converted_syntax_kinds';

import {expectTranslateJSON, prettyStringify} from '../json_test_support';

describe('type literals', () => {
  it('supports type literals', () => {
    expectTranslateJSON('declare let x: {};').to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [{
        kind: ConvertedSyntaxKind.VariableStatement,
        modifiers: [],
        keyword: 'let',
        declarations: [{
          kind: ConvertedSyntaxKind.VariableDeclaration,
          name: 'x',
          type: {kind: ConvertedSyntaxKind.TypeLiteral, members: []}
        }]
      }]
    }));

    expectTranslateJSON(`
declare type X = {};
declare let x: X;
`).to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [
        {
          kind: ConvertedSyntaxKind.TypeAliasDeclaration,
          modifiers: [],
          name: 'X',
          type: {kind: ConvertedSyntaxKind.TypeLiteral, members: []}
        },
        {
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [],
          keyword: 'let',
          declarations: [{
            kind: ConvertedSyntaxKind.VariableDeclaration,
            name: 'x',
            type: {kind: ConvertedSyntaxKind.TypeReference, typeName: 'X'}
          }]
        }
      ]
    }));
  });

  describe('members', () => {
    it('supports properties', () => {
      expectTranslateJSON('declare type X = {a: number, b: string};').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.TypeAliasDeclaration,
          modifiers: [],
          name: 'X',
          type: {
            kind: ConvertedSyntaxKind.TypeLiteral,
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'a',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'b',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
              }
            ]
          }
        }]
      }));
    });

    it('supports function properties', () => {
      expectTranslateJSON('declare type X = {f: () => number};').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.TypeAliasDeclaration,
          modifiers: [],
          name: 'X',
          type: {
            kind: ConvertedSyntaxKind.TypeLiteral,
            members: [{
              kind: ConvertedSyntaxKind.PropertyDeclaration,
              name: 'f',
              optional: false,
              type: {
                kind: ConvertedSyntaxKind.FunctionType,
                parameters: [],
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
              }
            }]
          }
        }]
      }));
    });

    it('supports methods', () => {
      expectTranslateJSON('declare type X = {f(): number};').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.TypeAliasDeclaration,
          modifiers: [],
          name: 'X',
          type: {
            kind: ConvertedSyntaxKind.TypeLiteral,
            members: [{
              kind: ConvertedSyntaxKind.MethodDeclaration,
              name: 'f',
              optional: false,
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              parameters: []
            }]
          }
        }]
      }));
    });
  });
});
