import * as ts from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {SignatureDeclaration} from '../named_declarations';

import {Type} from './type';

export class FunctionType extends SignatureDeclaration implements Type {
  constructor(node: ts.FunctionTypeNode) {
    super(node, ConvertedSyntaxKind.FunctionType);
  }
}
