import {ConvertedSyntaxKind} from '../../../lib/json/converted_syntax_kinds';

import {expectTranslateJSON, prettyStringify} from '../json_test_support';

describe('classes', () => {
  it('supports class declarations', () => {
    expectTranslateJSON('declare class X {}').to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements:
          [{kind: ConvertedSyntaxKind.ClassDeclaration, modifiers: [], name: 'X', members: []}]
    }));
  });

  it('supports abstract classes', () => {
    expectTranslateJSON('declare abstract class X {}').to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [{
        kind: ConvertedSyntaxKind.ClassDeclaration,
        modifiers: [{kind: ConvertedSyntaxKind.AbstractModifier}],
        name: 'X',
        members: []
      }]
    }));
  });

  describe('heritage clauses', () => {
    it('supports implements', () => {
      expectTranslateJSON('declare class X implements Y {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          heritageClauses: [{
            kind: ConvertedSyntaxKind.HeritageClause,
            keyword: 'implements',
            types: [{kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Y'}]
          }],
          members: []
        }]
      }));

      expectTranslateJSON('declare class X implements Y, Z {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          heritageClauses: [{
            kind: ConvertedSyntaxKind.HeritageClause,
            keyword: 'implements',
            types: [
              {kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Y'},
              {kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Z'}
            ]
          }],
          members: []
        }]
      }));
    });

    it('supports extends', () => {
      expectTranslateJSON('declare class X extends Y {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          heritageClauses: [{
            kind: ConvertedSyntaxKind.HeritageClause,
            keyword: 'extends',
            types: [{kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Y'}]
          }],
          members: []
        }]
      }));
    });

    it('supports classes with both heritage clauses', () => {
      expectTranslateJSON('declare class W extends X implements Y, Z {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'W',
          heritageClauses: [
            {
              kind: ConvertedSyntaxKind.HeritageClause,
              keyword: 'extends',
              types: [{kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'X'}]
            },
            {
              kind: ConvertedSyntaxKind.HeritageClause,
              keyword: 'implements',
              types: [
                {kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Y'},
                {kind: ConvertedSyntaxKind.ExpressionWithTypeArguments, expression: 'Z'}
              ]
            }
          ],
          members: []
        }]
      }));
    });
  });

  describe('type parameters', () => {
    it('should handle basic cases', () => {
      expectTranslateJSON('declare class X<T> {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          typeParameters: [{kind: ConvertedSyntaxKind.TypeParameter, name: 'T'}],
          members: []
        }]
      }));

      expectTranslateJSON('declare class X<T1, T2> {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
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
      expectTranslateJSON('declare class X<T extends string> {}').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
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

      expectTranslateJSON(`declare class X<T extends string> {}
                           declare class Y extends X<string> {}
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.ClassDeclaration,
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
            kind: ConvertedSyntaxKind.ClassDeclaration,
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

      expectTranslateJSON('declare class X<U extends number, T extends Promise<U>> {}')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.ClassDeclaration,
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
    it('ignores the semicolon class element', () => {
      expectTranslateJSON('declare class X { ; ; ; }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements:
            [{kind: ConvertedSyntaxKind.ClassDeclaration, modifiers: [], name: 'X', members: []}]
      }));
    });

    it('supports properties', () => {
      expectTranslateJSON('declare class X { a: number; b: string; }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
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
      expectTranslateJSON('declare class X { f(): void; }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
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

      expectTranslateJSON('declare class X { f(a: number, b: string): boolean; }')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.ClassDeclaration,
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
      expectTranslateJSON('declare abstract class X { abstract f(): number; }')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.ClassDeclaration,
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

    it('supports getters', () => {
      expectTranslateJSON('declare class X { get a(): number; }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.GetAccessor,
            name: 'a',
            parameters: [],
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
          }]
        }]
      }));
    });

    it('supports setters', () => {
      expectTranslateJSON('declare class X { set a(v: number); }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.SetAccessor,
            name: 'a',
            parameters: [{
              kind: ConvertedSyntaxKind.Parameter,
              name: 'v',
              optional: false,
              destructured: false,
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
            }],
          }]
        }]
      }));
    });

    it('supports constructors', () => {
      expectTranslateJSON('declare class X { constructor(); }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [{kind: ConvertedSyntaxKind.Constructor, parameters: []}]
        }]
      }));
    });

    it('supports private', () => {
      expectTranslateJSON(`
declare class X {
  private _a: number;
  private b(): boolean;
}`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [
            {
              kind: ConvertedSyntaxKind.PropertyDeclaration,
              modifiers: [{kind: ConvertedSyntaxKind.PrivateModifier}],
              name: '_a',
              optional: false,
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
            },
            {
              kind: ConvertedSyntaxKind.MethodDeclaration,
              modifiers: [{kind: ConvertedSyntaxKind.PrivateModifier}],
              name: 'b',
              optional: false,
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
              parameters: []
            }
          ]
        }]
      }));
    });

    it('supports protected', () => {
      expectTranslateJSON(`
declare class X {
  protected a: number;
  protected b(): boolean;
}`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [
            {
              kind: ConvertedSyntaxKind.PropertyDeclaration,
              modifiers: [{kind: ConvertedSyntaxKind.ProtectedModifier}],
              name: 'a',
              optional: false,
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
            },
            {
              kind: ConvertedSyntaxKind.MethodDeclaration,
              modifiers: [{kind: ConvertedSyntaxKind.ProtectedModifier}],
              name: 'b',
              optional: false,
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
              parameters: []
            }
          ]
        }]
      }));
    });

    it('supports optional', () => {
      expectTranslateJSON('declare class X { a?: number }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
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
      expectTranslateJSON('declare class X { readonly a: number }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
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

    it('supports static', () => {
      expectTranslateJSON('declare class X { static a: number; }').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.PropertyDeclaration,
            modifiers: [{kind: ConvertedSyntaxKind.StaticModifier}],
            name: 'a',
            optional: false,
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }]
      }));
    });

    it('supports parameter properties', () => {
      expectTranslateJSON(`
declare class X {
  constructor(public a: number, private _b: string = "hello") {}
}`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.ClassDeclaration,
          modifiers: [],
          name: 'X',
          members: [{
            kind: ConvertedSyntaxKind.Constructor,
            parameters: [
              {
                kind: ConvertedSyntaxKind.Parameter,
                modifiers: [{kind: ConvertedSyntaxKind.PublicModifier}],
                name: 'a',
                optional: false,
                destructured: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
              },
              {
                kind: ConvertedSyntaxKind.Parameter,
                modifiers: [{kind: ConvertedSyntaxKind.PrivateModifier}],
                name: '_b',
                optional: false,
                destructured: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
                initializer: '\'hello\''
              }
            ]
          }]
        }]
      }));
    });
  });
});
