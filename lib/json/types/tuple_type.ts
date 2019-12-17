import {TupleTypeNode as tsTupleTypeNode} from 'typescript';

import {convertTypeNode, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class TupleType extends Type {
  private elementTypes: Type[];
  constructor(node: tsTupleTypeNode) {
    super(node, ConvertedSyntaxKind.TupleType);
    this.elementTypes = node.elementTypes.map(convertTypeNode).filter(filterUndefined);
  }
}
