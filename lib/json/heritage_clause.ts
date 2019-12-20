import * as ts from 'typescript';

import {filterUndefined} from './conversions';
import {ConvertedSyntaxKind} from './converted_syntax_kinds';
import {ExpressionWithTypeArguments} from './expression_with_type_arguments';
import {Node} from './node';


export class HeritageClause extends Node {
  private keyword: string;
  private types: ExpressionWithTypeArguments[];
  constructor(node: ts.HeritageClause) {
    super(node, ConvertedSyntaxKind.HeritageClause);

    if (node.token === ts.SyntaxKind.ExtendsKeyword) {
      this.keyword = 'extends';
    } else if (node.token === ts.SyntaxKind.ImplementsKeyword) {
      this.keyword = 'implements';
    }
    this.types = node.types
                     .map((type: ts.ExpressionWithTypeArguments) => {
                       return new ExpressionWithTypeArguments(type);
                     })
                     .filter(filterUndefined);
  }
}
