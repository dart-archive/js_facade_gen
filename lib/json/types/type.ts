import {TypeNode as tsTypeNode} from 'typescript';

import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Node} from '../node';

export abstract class Type extends Node {
  constructor(node: tsTypeNode, kind: ConvertedSyntaxKind) {
    super(node, kind);
  }
}
