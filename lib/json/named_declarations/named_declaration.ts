import {isObjectBindingPattern, NamedDeclaration as tsNamedDeclaration} from 'typescript';

import {convertBindingName, convertName} from '../conversions';
import {ConvertedNamedDeclarationKind} from '../converted_syntax_kinds';
import {Node} from '../node';
import {ObjectBindingPattern} from '../object_binding_pattern';

export abstract class NamedDeclaration extends Node {
  private name?: string|ObjectBindingPattern;
  constructor(node: tsNamedDeclaration, kind: ConvertedNamedDeclarationKind) {
    super(node, kind);

    if (node.name) {
      if (isObjectBindingPattern(node.name)) {
        this.name = convertBindingName(node.name);
      } else {
        this.name = convertName(node.name);
      }
    }
  }
}
