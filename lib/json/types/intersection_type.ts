import {IntersectionTypeNode as tsIntersectionTypeNode} from 'typescript';

import {convertTypeNode, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class IntersectionType extends Type {
  private types: Type[];
  constructor(node: tsIntersectionTypeNode) {
    super(node, ConvertedSyntaxKind.IntersectionType);
    this.types = node.types.map(convertTypeNode).filter(filterUndefined);
  }
}
