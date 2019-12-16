import {ParenthesizedTypeNode as tsParenthesizedTypeNode} from 'typescript';

import {convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class ParenthesizedType extends Type {
  private type: Type;
  constructor(node: tsParenthesizedTypeNode) {
    super(node, ConvertedSyntaxKind.ParenthesizedType);
    this.type = convertTypeNode(node.type);
  }
}
