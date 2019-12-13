import {VariableDeclaration as tsVariableDeclaration} from 'typescript';

import {convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Type} from '../types';

import {NamedDeclaration} from './named_declaration';

export class VariableDeclaration extends NamedDeclaration {
  private type?: Type;
  constructor(node: tsVariableDeclaration) {
    super(node, ConvertedSyntaxKind.VariableDeclaration);

    if (node.type) {
      this.type = convertTypeNode(node.type);
    }
  }
}
