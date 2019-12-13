import {ExpressionWithTypeArguments as tsExpressionWithTypeArguments} from 'typescript';

import {convertExpression, convertTypeNode, filterUndefined} from './conversions';
import {ConvertedSyntaxKind} from './converted_syntax_kinds';
import {Node} from './node';
import {Type} from './types';

export class ExpressionWithTypeArguments extends Node {
  private typeArguments?: Type[];
  private expression: string;

  constructor(node: tsExpressionWithTypeArguments) {
    super(node, ConvertedSyntaxKind.ExpressionWithTypeArguments);

    if (node.typeArguments) {
      this.typeArguments = node.typeArguments.map(convertTypeNode).filter(filterUndefined);
    }
    this.expression = convertExpression(node.expression);
  }
}
