import {SignatureDeclaration as tsSignatureDeclaration} from 'typescript';

import {convertParameter, convertTypeNode, convertTypeParameter, filterUndefined} from '../conversions';
import {ConvertedSignatureKind} from '../converted_syntax_kinds';
import {Type} from '../types';

import {NamedDeclaration} from './named_declaration';
import {ParameterDeclaration} from './parameter_declaration';
import {TypeParameterDeclaration} from './type_parameter_declaration';

export abstract class SignatureDeclaration extends NamedDeclaration {
  private typeParameters?: TypeParameterDeclaration[];
  private parameters: ParameterDeclaration[];
  private type?: Type;
  constructor(node: tsSignatureDeclaration, kind: ConvertedSignatureKind) {
    super(node, kind);

    if (node.typeParameters) {
      this.typeParameters = node.typeParameters.map(convertTypeParameter).filter(filterUndefined);
    }
    this.parameters = node.parameters.map(convertParameter).filter(filterUndefined);
    if (node.type) {
      this.type = convertTypeNode(node.type);
    }
  }
}
