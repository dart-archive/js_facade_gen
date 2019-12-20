import {CallSignatureDeclaration as tsCallSignatureDeclaration} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {SignatureDeclaration} from './signature_declaration';

export class CallSignatureDeclaration extends SignatureDeclaration {
  constructor(node: tsCallSignatureDeclaration) {
    super(node, ConvertedSyntaxKind.CallSignature);
  }
}
