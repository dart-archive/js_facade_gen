import {ConstructorDeclaration as tsConstructorDeclaration} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {SignatureDeclaration} from './signature_declaration';

export class ConstructorDeclaration extends SignatureDeclaration {
  constructor(node: tsConstructorDeclaration) {
    super(node, ConvertedSyntaxKind.Constructor);
  }
}
