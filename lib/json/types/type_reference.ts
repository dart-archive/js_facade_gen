import {TypeReferenceNode as tsTypeReferenceNode} from 'typescript';

import * as base from '../../base';
import {convertTypeNode, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class TypeReference extends Type {
  typeName: string;
  typeArguments?: Type[];
  constructor(node: tsTypeReferenceNode) {
    super(node, ConvertedSyntaxKind.TypeReference);

    this.typeName = base.ident(node.typeName);
    if (node.typeArguments) {
      this.typeArguments = node.typeArguments.map(convertTypeNode).filter(filterUndefined);
    }
  }
}
