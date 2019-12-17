import {BindingElement as tsBindingElement, ObjectBindingPattern as tsObjectBindingPattern} from 'typescript';

import {convertExpression, filterUndefined} from './conversions';
import {ConvertedSyntaxKind} from './converted_syntax_kinds';
import {NamedDeclaration} from './named_declarations';
import {Node} from './node';

export class ObjectBindingPattern extends Node {
  private elements: Node[];
  constructor(node: tsObjectBindingPattern) {
    super(node, ConvertedSyntaxKind.ObjectBindingPattern);
    this.elements = node.elements
                        .map((element: tsBindingElement) => {
                          return new BindingElement(element);
                        })
                        .filter(filterUndefined);
  }
}

class BindingElement extends NamedDeclaration {
  private propertyName?: string;
  private rest = false;
  private initializer?: string;

  constructor(node: tsBindingElement) {
    super(node, ConvertedSyntaxKind.BindingElement);

    if (node.dotDotDotToken) {
      this.rest = true;
    }
    if (node.initializer) {
      this.initializer = convertExpression(node.initializer);
    }
  }
}
