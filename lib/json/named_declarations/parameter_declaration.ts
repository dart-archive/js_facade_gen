import {ParameterDeclaration as tsParameterDeclaration} from 'typescript';

import {convertExpression, convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Type} from '../types';

import {NamedDeclaration} from './named_declaration';

export class ParameterDeclaration extends NamedDeclaration {
  private type: Type;
  private optional = false;
  private destructured = false;
  private initializer?: string;

  constructor(node: tsParameterDeclaration) {
    super(node, ConvertedSyntaxKind.Parameter);

    this.type = convertTypeNode(node.type);
    if (node.questionToken) {
      this.optional = true;
    }
    if (node.dotDotDotToken) {
      this.destructured = true;
    }
    if (node.initializer) {
      this.initializer = convertExpression(node.initializer);
    }
  }
}
