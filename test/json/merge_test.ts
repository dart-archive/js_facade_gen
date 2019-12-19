import {ConvertedSyntaxKind} from '../../lib/json/converted_syntax_kinds';

import {expectTranslateJSON, prettyStringify} from './json_test_support';

describe('merging variables with types', () => {
  describe('upgrading variables whose types contain construct signatures', () => {
    it('supports type literals with construct signatures', () => {
      expectTranslateJSON(`
declare interface XType {
  a: number;
  b: string;
  c(): boolean;
}

declare var X: { new(a: number, b: string): XType };
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'XType',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'a',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'b',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
              },
              {
                kind: ConvertedSyntaxKind.MethodDeclaration,
                name: 'c',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
                parameters: []
              }
            ]
          },
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'X',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'a',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'b',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
              },
              {
                kind: ConvertedSyntaxKind.MethodDeclaration,
                name: 'c',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
                parameters: []
              },
              {
                kind: ConvertedSyntaxKind.ConstructSignature,
                name: 'X',
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
              }
            ]
          },
        ]
      }));
    });

    it('supports interfaces with construct signatures', () => {
      expectTranslateJSON(`
declare interface XType {
  a: number;
  b: string;
  c(): boolean;
}

declare interface X {
    new(a: number, b: string): XType;
}
declare var X: X;
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'XType',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'a',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'b',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
              },
              {
                kind: ConvertedSyntaxKind.MethodDeclaration,
                name: 'c',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
                parameters: []
              }
            ]
          },
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'X',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'a',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'b',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
              },
              {
                kind: ConvertedSyntaxKind.MethodDeclaration,
                name: 'c',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
                parameters: []
              },
              {
                kind: ConvertedSyntaxKind.ConstructSignature,
                name: 'X',
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
              }
            ]
          },
        ]
      }));
    });

    it('makes members of the type static in the upgraded class by default', () => {
      expectTranslateJSON(`
declare interface XType {
  n: number;
}

declare var X: {
  new(n: number): XType
  m: string;
};
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'XType',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'n',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
            ]
          },
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'X',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'n',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
              {
                kind: ConvertedSyntaxKind.ConstructSignature,
                name: 'X',
                parameters: [{
                  kind: ConvertedSyntaxKind.Parameter,
                  name: 'n',
                  optional: false,
                  destructured: false,
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                }],
                type: {kind: ConvertedSyntaxKind.TypeReference, typeName: 'XType'}
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                modifiers: [{kind: ConvertedSyntaxKind.StaticModifier}],
                name: 'm',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
              },
            ]
          },
        ]
      }));
    });

    it('does not make members of the type static when the --explicit-static flag is set', () => {
      const explicitStaticOpts = {toJSON: true, failFast: true, explicitStatic: true};
      expectTranslateJSON(
          `
declare interface XType {
  n: number;
}

declare var X: {
  new(n: number): XType
  m: string;
};
`,
          explicitStaticOpts,
          )
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [
              {
                kind: ConvertedSyntaxKind.InterfaceDeclaration,
                modifiers: [],
                name: 'XType',
                members: [
                  {
                    kind: ConvertedSyntaxKind.PropertyDeclaration,
                    name: 'n',
                    optional: false,
                    type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
                  },
                ]
              },
              {
                kind: ConvertedSyntaxKind.InterfaceDeclaration,
                modifiers: [],
                name: 'X',
                members: [
                  {
                    kind: ConvertedSyntaxKind.PropertyDeclaration,
                    name: 'n',
                    optional: false,
                    type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
                  },
                  {
                    kind: ConvertedSyntaxKind.ConstructSignature,
                    name: 'X',
                    parameters: [{
                      kind: ConvertedSyntaxKind.Parameter,
                      name: 'n',
                      optional: false,
                      destructured: false,
                      type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                    }],
                    type: {kind: ConvertedSyntaxKind.TypeReference, typeName: 'XType'}
                  },
                  {
                    kind: ConvertedSyntaxKind.PropertyDeclaration,
                    name: 'm',
                    optional: false,
                    type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
                  },
                ]
              },
            ]
          }));
    });
  });

  describe('merging variables with types based on their names', () => {
    it('merges variables with types if they have the exact same name by default', () => {
      expectTranslateJSON(`
declare interface X {
  a: number;
  b: string;
  c(): boolean;
}

declare var X: { d: number; }
`).to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [
          {
            kind: ConvertedSyntaxKind.InterfaceDeclaration,
            modifiers: [],
            name: 'X',
            members: [
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'a',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                name: 'b',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
              },
              {
                kind: ConvertedSyntaxKind.MethodDeclaration,
                name: 'c',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'},
                parameters: []
              },
              {
                kind: ConvertedSyntaxKind.PropertyDeclaration,
                modifiers: [{kind: ConvertedSyntaxKind.StaticModifier}],
                name: 'd',
                optional: false,
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
              }
            ]
          },
          // TODO(derekx): Small fix to make the JSON cleaner: in mergeVariablesIntoClasses we
          // should detect when deleting a VariableDeclartion makes the parent
          // VariableDeclarationList empty, and delete the list node as well.
          {
            kind: ConvertedSyntaxKind.VariableStatement,
            modifiers: [],
            keyword: 'var',
            declarations: []
          }
        ]
      }));
    });

    // TODO(derekx): The following test should pass, but currently the type of var x is incorrect.
    // It is currently a TypeReference to 'X', but it should be to 'XType'.
    //     it('renames types that conflict with unrelated variables when --rename-conflicting-types
    //     is set',
    //        () => {
    //          const renameTypesOpts = {toJSON: true, failFast: true, renameConflictingTypes:
    //          true}; expectTranslateJSON(
    //              `
    // declare interface X {
    //   a: number;
    //   b: string;
    // }

    // declare var X: { y: number; }

    // declare var x: X;
    // `,
    //              renameTypesOpts,
    //              )
    //              .to.equal(prettyStringify({
    //                kind: ConvertedSyntaxKind.SourceFile,
    //                fileName: 'demo/some/main.ts',
    //                statements: [
    //                  {
    //                    kind: ConvertedSyntaxKind.InterfaceDeclaration,
    //                    modifiers: [],
    //                    name: 'XType',
    //                    members: [
    //                      {
    //                        kind: ConvertedSyntaxKind.PropertyDeclaration,
    //                        name: 'a',
    //                        optional: false,
    //                        type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'},
    //                      },
    //                      {
    //                        kind: ConvertedSyntaxKind.PropertyDeclaration,
    //                        name: 'b',
    //                        optional: false,
    //                        type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'},
    //                      },
    //                    ]
    //                  },
    //                  {
    //                    kind: ConvertedSyntaxKind.VariableStatement,
    //                    keyword: 'var',
    //                    declarations: [{
    //                      kind: ConvertedSyntaxKind.VariableDeclaration,
    //                      name: 'X',
    //                      type: {
    //                        kind: ConvertedSyntaxKind.TypeLiteral,
    //                        members: [{
    //                          kind: ConvertedSyntaxKind.PropertyDeclaration,
    //                          name: 'y',
    //                          type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
    //                        }]
    //                      }
    //                    }]
    //                  },
    //                  {
    //                    kind: ConvertedSyntaxKind.VariableStatement,
    //                    keyword: 'var',
    //                    declarations: [{
    //                      kind: ConvertedSyntaxKind.VariableDeclaration,
    //                      name: 'x',
    //                      type: {kind: ConvertedSyntaxKind.TypeReference, typeName: 'XType'}
    //                    }]
    //                  }
    //                ]
    //              }));
    //        });
  });
});
