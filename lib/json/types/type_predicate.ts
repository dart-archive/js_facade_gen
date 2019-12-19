import * as ts from 'typescript';

import {convertName, convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {Type} from './type';

export class TypePredicate extends Type {
  private assertsModifier = false;
  private parameterName: string;
  private type: Type;

  constructor(node: ts.TypePredicateNode) {
    super(node, ConvertedSyntaxKind.TypePredicate);

    if (node.assertsModifier) {
      this.assertsModifier = true;
    }
    if (ts.isThisTypeNode(node.parameterName)) {
      this.parameterName = 'this';
    } else {
      this.parameterName = convertName(node.parameterName);
    }
    this.type = convertTypeNode(node.type);
  }
}
