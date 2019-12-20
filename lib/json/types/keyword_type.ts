import * as ts from 'typescript';

import {ConvertedKeywordType, ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class KeywordType extends Type {
  constructor(node: ts.KeywordTypeNode, private typeName: ConvertedKeywordType) {
    super(node, ConvertedSyntaxKind.KeywordType);
  }
}

/**
 * Returns whether or not a TypeNode is a KeywordTypeNode.
 */
export function isKeywordTypeNode(type: ts.TypeNode): type is ts.KeywordTypeNode {
  switch (type.kind) {
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BigIntKeyword:
    case ts.SyntaxKind.ObjectKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.SymbolKeyword:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.NeverKeyword:
    case ts.SyntaxKind.NumberKeyword:
      return true;
    default:
      return false;
  }
}
