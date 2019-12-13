import * as ts from 'typescript';

import {convertTypeNode} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Type} from '../types';

import {NamedDeclaration} from './named_declaration';


export class TypeParameterDeclaration extends NamedDeclaration {
  private constraint?: Type;
  private default?: Type;

  constructor(node: ts.TypeParameterDeclaration) {
    super(node, ConvertedSyntaxKind.TypeParameter);

    if (node.constraint) {
      this.constraint = convertTypeNode(ts.getEffectiveConstraintOfTypeParameter(node));
    }
    if (node.default) {
      this.default = convertTypeNode(node.default);
    }
  }
}
