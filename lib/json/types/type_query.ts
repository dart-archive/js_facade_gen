import {TypeQueryNode as tsTypeQueryNode} from 'typescript';

import {convertName} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class TypeQuery extends Type {
  private exprName: string;
  constructor(node: tsTypeQueryNode) {
    super(node, ConvertedSyntaxKind.TypeQuery);
    this.exprName = convertName(node.exprName);
  }
}
