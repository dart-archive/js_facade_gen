import {TypeLiteralNode as tsTypeLiteralNode} from 'typescript';

import {convertMember} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {MemberDeclaration} from '../named_declarations';

import {Type} from './type';

export class TypeLiteral extends Type {
  members: MemberDeclaration[];
  constructor(node: tsTypeLiteralNode) {
    super(node, ConvertedSyntaxKind.TypeLiteral);

    this.members = node.members.map(convertMember);
  }
}
