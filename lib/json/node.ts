import * as ts from 'typescript';

import {filterUndefined} from './conversions';
import {ConvertedModifierKind, ConvertedSyntaxKind} from './converted_syntax_kinds';

export abstract class Node {
  private decorators?: Decorator[];
  private modifiers?: Modifier[];
  constructor(node: ts.Node, private kind: ConvertedSyntaxKind) {
    if (Array.isArray(node.decorators)) {
      this.decorators = node.decorators.map(convertDecorator).filter(filterUndefined);
    }
    if (Array.isArray(node.modifiers)) {
      this.modifiers = node.modifiers.map(convertModifier).filter(filterUndefined);
    }
  }
}

class Decorator extends Node {
  constructor(node: ts.Decorator) {
    super(node, ConvertedSyntaxKind.Decorator);
  }
}

function convertDecorator(decorator: ts.Decorator): Decorator {
  return new Decorator(decorator);
}

class Modifier extends Node {
  constructor(node: ts.Modifier, kind: ConvertedModifierKind) {
    super(node, kind);
  }
}

function convertModifier(modifier: ts.Modifier): Modifier {
  switch (modifier.kind) {
    case ts.SyntaxKind.AbstractKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.AbstractModifier);
    case ts.SyntaxKind.AsyncKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.AsyncModifier);
    case ts.SyntaxKind.ConstKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.ConstModifier);
    case ts.SyntaxKind.ExportKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.ExportModifier);
    case ts.SyntaxKind.PublicKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.PublicModifier);
    case ts.SyntaxKind.PrivateKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.PrivateModifier);
    case ts.SyntaxKind.ProtectedKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.ProtectedModifier);
    case ts.SyntaxKind.ReadonlyKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.ReadonlyModifier);
    case ts.SyntaxKind.StaticKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.StaticModifier);
    case ts.SyntaxKind.DefaultKeyword:
      return new Modifier(modifier, ConvertedSyntaxKind.DefaultModifier);
    case ts.SyntaxKind.DeclareKeyword:
      // no-op, this modifier doesn't get used by the emitter
      return undefined;
    default:
      const error =
          new Error(`Unexpected Modifier kind: ${ts.SyntaxKind[(modifier as ts.Node).kind]}`);
      throw error;
  }
}
