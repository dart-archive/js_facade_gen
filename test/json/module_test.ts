import {ConvertedSyntaxKind} from '../../lib/json/converted_syntax_kinds';

import {expectTranslateJSON, expectWithExports, prettyStringify} from './json_test_support';

describe('imports and exports', () => {
  it('converts export declarations', () => {
    expectTranslateJSON(`var x: string = 'abc';
                         var y: number = 123;
                         
                         export {x, y};`)
        .to.equal(prettyStringify({
          kind: ConvertedSyntaxKind.SourceFile,
          fileName: 'demo/some/main.ts',
          statements: [
            {
              kind: ConvertedSyntaxKind.VariableStatement,
              keyword: 'var',
              declarations: [{
                kind: ConvertedSyntaxKind.VariableDeclaration,
                name: 'x',
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
              }]
            },
            {
              kind: ConvertedSyntaxKind.VariableStatement,
              keyword: 'var',
              declarations: [{
                kind: ConvertedSyntaxKind.VariableDeclaration,
                name: 'y',
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
              }]
            },
            {
              kind: ConvertedSyntaxKind.ExportDeclaration,
              exportClause: {
                kind: ConvertedSyntaxKind.NamedExports,
                elements: [
                  {kind: ConvertedSyntaxKind.ExportSpecifier, name: 'x'},
                  {kind: ConvertedSyntaxKind.ExportSpecifier, name: 'y'}
                ]
              }
            }
          ]
        }));
  });

  it('converts the export modifier', () => {
    expectTranslateJSON(`export var x: string = 'abc';
                         export var y: number = 123;
`).to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [
        {
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [{kind: ConvertedSyntaxKind.ExportModifier}],
          keyword: 'var',
          declarations: [{
            kind: ConvertedSyntaxKind.VariableDeclaration,
            name: 'x',
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
          }]
        },
        {
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [{kind: ConvertedSyntaxKind.ExportModifier}],
          keyword: 'var',
          declarations: [{
            kind: ConvertedSyntaxKind.VariableDeclaration,
            name: 'y',
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }
      ]
    }));
  });

  it('converts import declarations', () => {
    expectWithExports(`import {X, Y} from './other'`).to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [{
        kind: ConvertedSyntaxKind.ImportDeclaration,
        importClause: {
          kind: ConvertedSyntaxKind.ImportClause,
          namedBindings: {
            kind: ConvertedSyntaxKind.NamedImports,
            elements: [
              {kind: ConvertedSyntaxKind.ImportSpecifier, name: 'X'},
              {kind: ConvertedSyntaxKind.ImportSpecifier, name: 'Y'}
            ]
          }
        },
        moduleSpecifier: `'./other'`
      }]
    }));
  });
});

describe('module declarations', () => {
  it('converts module declarations', () => {
    expectWithExports('declare module m1 { export var x: number; }').to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [{
        kind: ConvertedSyntaxKind.ModuleDeclaration,
        modifiers: [],
        name: 'm1',
        body: {
          kind: ConvertedSyntaxKind.ModuleBlock,
          statements: [{
            kind: ConvertedSyntaxKind.VariableStatement,
            modifiers: [{kind: ConvertedSyntaxKind.ExportModifier}],
            keyword: 'var',
            declarations: [{
              kind: ConvertedSyntaxKind.VariableDeclaration,
              name: 'x',
              type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
            }]
          }]
        }
      }]
    }));
  });

  it('converts nested module declarations', () => {
    expectWithExports(`
declare module m1.a {
  export var x: number;
}`).to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [{
        kind: ConvertedSyntaxKind.ModuleDeclaration,
        modifiers: [],
        name: 'm1',
        body: {
          kind: ConvertedSyntaxKind.ModuleDeclaration,
          name: 'a',
          body: {
            kind: ConvertedSyntaxKind.ModuleBlock,
            statements: [{
              kind: ConvertedSyntaxKind.VariableStatement,
              modifiers: [{kind: ConvertedSyntaxKind.ExportModifier}],
              keyword: 'var',
              declarations: [{
                kind: ConvertedSyntaxKind.VariableDeclaration,
                name: 'x',
                type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
              }]
            }]
          }
        }
      }]
    }));

    expectWithExports(`
declare module m1 {
  module a {
    export var x: number;
  }
}`).to.equal(prettyStringify({
      kind: ConvertedSyntaxKind.SourceFile,
      fileName: 'demo/some/main.ts',
      statements: [{
        kind: ConvertedSyntaxKind.ModuleDeclaration,
        modifiers: [],
        name: 'm1',
        body: {
          kind: ConvertedSyntaxKind.ModuleBlock,
          statements: [{
            kind: ConvertedSyntaxKind.ModuleDeclaration,
            name: 'a',
            body: {
              kind: ConvertedSyntaxKind.ModuleBlock,
              statements: [{
                kind: ConvertedSyntaxKind.VariableStatement,
                modifiers: [{kind: ConvertedSyntaxKind.ExportModifier}],
                keyword: 'var',
                declarations: [{
                  kind: ConvertedSyntaxKind.VariableDeclaration,
                  name: 'x',
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                }]
              }]
            }
          }]
        }
      }]
    }));
  });
});
