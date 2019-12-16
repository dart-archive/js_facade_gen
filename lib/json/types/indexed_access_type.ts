import {IndexedAccessTypeNode as tsIndexedAccessTypeNode} from 'typescript';

import {convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class IndexedAccessType extends Type {
  private objectType: Type;
  private indexType: Type;
  constructor(node: tsIndexedAccessTypeNode) {
    super(node, ConvertedSyntaxKind.ParenthesizedType);
    this.objectType = convertTypeNode(node.objectType);
    this.indexType = convertTypeNode(node.indexType);
  }
}
