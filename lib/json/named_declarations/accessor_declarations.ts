import {GetAccessorDeclaration as tsGetAccessorDeclaration, SetAccessorDeclaration as tsSetAccessorDeclaration} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {SignatureDeclaration} from './signature_declaration';

export class GetAccessorDeclaration extends SignatureDeclaration {
  constructor(node: tsGetAccessorDeclaration) {
    super(node, ConvertedSyntaxKind.GetAccessor);
  }
}

export class SetAccessorDeclaration extends SignatureDeclaration {
  constructor(node: tsSetAccessorDeclaration) {
    super(node, ConvertedSyntaxKind.SetAccessor);
  }
}
