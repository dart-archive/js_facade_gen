import {UnionTypeNode as tsUnionTypeNode} from 'typescript';

import {convertTypeNode, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class UnionType extends Type {
  private types: Type[];
  constructor(node: tsUnionTypeNode) {
    super(node, ConvertedSyntaxKind.UnionType);
    this.types = node.types.map(convertTypeNode).filter(filterUndefined);
  }
}
