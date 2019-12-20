import {TypeAliasDeclaration as tsTypeAliasDeclaration} from 'typescript';

import {convertTypeNode, convertTypeParameter, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Type} from '../types';

import {NamedDeclaration} from './named_declaration';
import {TypeParameterDeclaration} from './type_parameter_declaration';

export class TypeAliasDeclaration extends NamedDeclaration {
  private type: Type;
  private typeParameters?: TypeParameterDeclaration[];
  constructor(node: tsTypeAliasDeclaration) {
    super(node, ConvertedSyntaxKind.TypeAliasDeclaration);

    this.type = convertTypeNode(node.type);
    if (node.typeParameters) {
      this.typeParameters = node.typeParameters.map(convertTypeParameter).filter(filterUndefined);
    }
  }
}
