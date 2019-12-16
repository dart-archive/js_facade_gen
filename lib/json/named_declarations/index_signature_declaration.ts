import {IndexSignatureDeclaration as tsIndexSignatureDeclaration} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {SignatureDeclaration} from './signature_declaration';

export class IndexSignatureDeclaration extends SignatureDeclaration {
  constructor(node: tsIndexSignatureDeclaration) {
    super(node, ConvertedSyntaxKind.ConstructSignature);
  }
}
