import {ConstructSignatureDeclaration as tsConstructSignatureDeclaration} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {SignatureDeclaration} from './signature_declaration';

export class ConstructSignatureDeclaration extends SignatureDeclaration {
  constructor(node: tsConstructSignatureDeclaration) {
    super(node, ConvertedSyntaxKind.ConstructSignature);
  }
}
