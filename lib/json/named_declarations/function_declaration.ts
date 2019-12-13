import {FunctionLikeDeclaration as tsFunctionLikeDeclaration} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';

import {SignatureDeclaration} from './signature_declaration';

export class FunctionDeclaration extends SignatureDeclaration {
  constructor(node: tsFunctionLikeDeclaration) {
    super(node, ConvertedSyntaxKind.FunctionDeclaration);
  }
}
