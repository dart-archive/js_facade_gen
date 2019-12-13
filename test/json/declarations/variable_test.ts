import {ConvertedSyntaxKind} from '../../../lib/json/converted_syntax_kinds';

import {expectTranslateJSON, prettyStringify} from '../json_test_support';

describe('variables', () => {
  describe('variable declarations', () => {
    it('supports declare var', () => {
      expectTranslateJSON('declare var a: number;').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [],
          keyword: 'var',
          declarations: [{
            kind: ConvertedSyntaxKind.VariableDeclaration,
            name: 'a',
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }]
      }));
    });

    it('supports declare let', () => {
      expectTranslateJSON('declare let a: number;').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [],
          keyword: 'let',
          declarations: [{
            kind: ConvertedSyntaxKind.VariableDeclaration,
            name: 'a',
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }]
      }));
    });

    it('supports declare const', () => {
      expectTranslateJSON('declare const a: number;').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [],
          keyword: 'const',
          declarations: [{
            kind: ConvertedSyntaxKind.VariableDeclaration,
            name: 'a',
            type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
          }]
        }]
      }));
    });

    it('supports lines with multiple declarations', () => {
      expectTranslateJSON('declare const a: number, b: string, c: boolean;')
          .to.equal(prettyStringify({
            kind: ConvertedSyntaxKind.SourceFile,
            fileName: 'demo/some/main.ts',
            statements: [{
              kind: ConvertedSyntaxKind.VariableStatement,
              modifiers: [],
              keyword: 'const',
              declarations: [
                {
                  kind: ConvertedSyntaxKind.VariableDeclaration,
                  name: 'a',
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'number'}
                },
                {
                  kind: ConvertedSyntaxKind.VariableDeclaration,
                  name: 'b',
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'string'}
                },
                {
                  kind: ConvertedSyntaxKind.VariableDeclaration,
                  name: 'c',
                  type: {kind: ConvertedSyntaxKind.KeywordType, typeName: 'boolean'}
                }
              ]
            }]
          }));
    });

    it('supports untyped variables', () => {
      expectTranslateJSON('declare let a, b;').to.equal(prettyStringify({
        kind: ConvertedSyntaxKind.SourceFile,
        fileName: 'demo/some/main.ts',
        statements: [{
          kind: ConvertedSyntaxKind.VariableStatement,
          modifiers: [],
          keyword: 'let',
          declarations: [
            {kind: ConvertedSyntaxKind.VariableDeclaration, name: 'a'},
            {kind: ConvertedSyntaxKind.VariableDeclaration, name: 'b'}
          ]
        }]
      }));
    });
  });
});
