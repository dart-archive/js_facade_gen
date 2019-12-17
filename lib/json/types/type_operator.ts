import * as ts from 'typescript';

import {convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class TypeOperator extends Type {
  private operator: 'keyof'|'unique'|'readonly';
  private type: Type;
  constructor(node: ts.TypeOperatorNode) {
    super(node, ConvertedSyntaxKind.TypeOperator);

    switch (node.operator) {
      case ts.SyntaxKind.KeyOfKeyword:
        this.operator = 'keyof';
        break;
      case ts.SyntaxKind.UniqueKeyword:
        this.operator = 'unique';
        break;
      case ts.SyntaxKind.ReadonlyKeyword:
        this.operator = 'readonly';
        break;
      default:
        break;
    }

    this.type = convertTypeNode(node.type);
  }
}
