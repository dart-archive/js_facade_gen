import {LiteralTypeNode as tsLiteralTypeNode} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class LiteralType extends Type {
  constructor(node: tsLiteralTypeNode, private typeName: string) {
    super(node, ConvertedSyntaxKind.LiteralType);
  }
}
