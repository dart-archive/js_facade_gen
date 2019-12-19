import {ConvertedSyntaxKind} from '../../../lib/json/converted_syntax_kinds';

import {expectTranslateJSON, prettyStringify} from '../json_test_support';

describe('interfaces', () => {
  it('supports interface declarations', () => {
    expectTranslateJSON('declare interface X {}').to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements:
          [{kind: ConvertedSyntaxKind.InterfaceDeclaration, modifiers: [], name: 'X', members: []}]
    }));
  });

  describe('heritage clauses', () => {
    it('supports extends', () => {
      expectTranslateJSON('declare interface X extends Y, Z {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          heritageClauses: [{
            kind: ConvertedSyntaxKind.HeritageClause,
            keyword: 'extends',
            types: [
              {kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Y'},
              {kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Z'}
            ]
          }],
          members: []
        }]
      }));
    });
  });

  describe('type parameters', () => {
    it('should handle basic cases', () => {
      expectTranslateJSON('declare interface X<T> {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          typeParameters: [{kind: ConvertedSyntaxKind.TypeParameter, name: 'T'}],
          members: []
        }]
      }));

      expectTranslateJSON('declare interface X<T1, T2> {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          typeParameters: [
            {kind: ConvertedSyntaxKind.TypeParameter, name: 'T1'},
            {kind: ConvertedSyntaxKind.TypeParameter, name: 'T2'}
          ],
          members: []
        }]
      }));
    });

    it('should handle type parameters with constraints', () => {
      expectTranslateJSON('declare interface X<T extends string> {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          typeParameters: [{
            kind: ConvertedSyntaxKind.TypeParameter,
            name: 'T',
            constraint: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
          }],
          members: []
        }]
      }));

      expectTranslateJSON(`declare interface X<T extends string> {}
                           declare interface Y extends X<string> {}
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'X',
            typeParameters: [{
              kind: ConvertedSyntaxKind.TypeParameter,
              name: 'T',
              constraint: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
            }],
            members: []
          },
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'Y',
            heritageClauses: [{
              kind: ConvertedSyntaxKind.HeritageClause,
              keyword: 'extends',
              types: [{
                kind: ConvertedSyntaxKind.ExpressionWithTypeArguments,
                typeArguments: [{kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}],
                expression: 'X'
              }]
            }],
            members: []
          }
        ]
      }));

      expectTranslateJSON('declare interface X<U extends number, T extends Promise<U>> {}')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.InterfaceDeclaration,
              modifiers: [],
              name: 'X',
              typeParameters: [
                {
                  kind: ConvertedSyntaxKind.TypeParameter,
                  name: 'U',
                  constraint: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                },
                {
                  kind: ConvertedSyntaxKind.TypeParameter,
                  name: 'T',
                  constraint: {
                    kind: ConvertedSyntaxKind.TypeReference,
                    typeName: 'Promise',
                    typeArguments: [{kind: ConvertedSyntaxKind.TypeReference, typeName: 'U'}]
                  }
                }
              ],
              members: []
            }]
          }));
    });
  });

  describe('members', () => {
    it('supports properties', () => {
      expectTranslateJSON('declare interface X { a: number; b: string; }')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.InterfaceDeclaration,
              modifiers: [],
              name: 'X',
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
            }]
          }));
    });

    it('supports methods', () => {
      expectTranslateJSON('declare interface X { f(): void; }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.MethodDeclaration,
            name: 'f',
            optional: false,
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'void'},
            parameters: []
          }]
        }]
      }));

      expectTranslateJSON('declare interface X { f(a: number, b: string): boolean; }')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.InterfaceDeclaration,
              modifiers: [],
              name: 'X',
              members: [{
                kind: ConvertedSyntaxKind.MethodDeclaration,
                name: 'f',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
                parameters: [
                  {
                    kind: ConvertedSyntaxKind.Parameter,
                    name: 'a',
                    optional: false,
                    destructured: false,
                    type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                  },
                  {
                    kind: ConvertedSyntaxKind.Parameter,
                    name: 'b',
                    optional: false,
                    destructured: false,
                    type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
                  }
                ]
              }]
            }]
          }));
    });

    it('supports abstract methods', () => {
      expectTranslateJSON('declare abstract interface X { abstract f(): number; }')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.InterfaceDeclaration,
              modifiers: [{kind: ConvertedSyntaxKind.AbstractModifier}],
              name: 'X',
              members: [{
                kind: ConvertedSyntaxKind.MethodDeclaration,
                modifiers: [{kind: ConvertedSyntaxKind.AbstractModifier}],
                name: 'f',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
                parameters: []
              }]
            }]
          }));
    });

    it('supports optional', () => {
      expectTranslateJSON('declare interface X { a?: number }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.PropertyDeclaration,
            name: 'a',
            optional: true,
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }]
      }));
    });

    it('supports readonly', () => {
      expectTranslateJSON('declare interface X { readonly a: number }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.InterfaceDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.PropertyDeclaration,
            modifiers: [{kind: ConvertedSyntaxKind.ReadonlyModifier}],
            name: 'a',
            optional: false,
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }]
      }));
    });

    it('supports call signatures', () => {
      expectTranslateJSON('declare interface FnDef { (y: number): string; }')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [
              {
                kind: ConvertedSyntaxKind.InterfaceDeclaration,
                modifiers: [],
                name: 'FnDef',
                members: [{
                  kind: ConvertedSyntaxKind.CallSignature,
                  parameters: [{
                    kind: ConvertedSyntaxKind.Parameter,
                    name: 'y',
                    optional: false,
                    destructured: false,
                    type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                  }],
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
                }]
              },
            ]
          }));
    });

    it('supports construct signatures', () => {
      expectTranslateJSON(`
declare interface X {
    new(a: number, b: string): XType;
}
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'X',
            members: [{
              kind: ConvertedSyntaxKind.ConstructSignature,
              parameters: [
                {
                  kind: ConvertedSyntaxKind.Parameter,
                  name: 'a',
                  optional: false,
                  destructured: false,
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                },
                {
                  kind: ConvertedSyntaxKind.Parameter,
                  name: 'b',
                  optional: false,
                  destructured: false,
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
                }
              ],
              type: {kind: ConvertedSyntaxKind.TypeReference, typeName: 'XType'}
            }]
          },
        ]
      }));
    });
  });
});
