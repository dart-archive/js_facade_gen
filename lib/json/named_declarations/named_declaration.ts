import {NamedDeclaration as tsNamedDeclaration} from 'typescript';

import {convertName} from '../conversions';
import {ConvertedNamedDeclarationKind} from '../converted_syntax_kinds';
import {Node} from '../node';

export abstract class NamedDeclaration extends Node {
  private name?: string;
  constructor(node: tsNamedDeclaration, kind: ConvertedNamedDeclarationKind) {
    super(node, kind);

    if (node.name) {
      this.name = convertName(node.name);
    }
  }
}
