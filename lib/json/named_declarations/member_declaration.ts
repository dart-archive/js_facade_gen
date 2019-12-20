import * as ts from 'typescript';

import {convertExpression, convertTypeNode, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Type} from '../types';

import {NamedDeclaration} from './named_declaration';
import {ParameterDeclaration} from './parameter_declaration';

export abstract class MemberDeclaration extends NamedDeclaration {
  constructor(
      node: ts.ClassElement|ts.TypeElement,
      kind: ConvertedSyntaxKind.PropertyDeclaration|ConvertedSyntaxKind.MethodDeclaration) {
    super(node, kind);
  }
}

export class PropertyDeclaration extends MemberDeclaration {
  private type: Type;
  private optional = false;
  private initializer?: string;
  constructor(node: ts.PropertyDeclaration|ts.PropertySignature) {
    super(node, ConvertedSyntaxKind.PropertyDeclaration);

    this.type = convertTypeNode(node.type);
    if (node.questionToken) {
      this.optional = true;
    }
    if (node.initializer) {
      this.initializer = convertExpression(node.initializer);
    }
  }
}

export class MethodDeclaration extends MemberDeclaration {
  private type: Type;
  private optional = false;
  private parameters: ParameterDeclaration[];
  constructor(node: ts.MethodDeclaration|ts.MethodSignature) {
    super(node, ConvertedSyntaxKind.MethodDeclaration);

    this.type = convertTypeNode(node.type);
    if (node.questionToken) {
      this.optional = true;
    }
    this.parameters =
        node.parameters.map((param: ts.ParameterDeclaration) => new ParameterDeclaration(param))
            .filter(filterUndefined);
  }
}
