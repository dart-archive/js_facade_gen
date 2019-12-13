import * as ts from 'typescript';

import {convertExpression, convertName} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {NamedDeclaration} from '../named_declarations';
import {Node} from '../node';

export class ImportDeclaration extends Node {
  private importClause?: ImportClause;
  private moduleSpecifier: string;
  constructor(node: ts.ImportDeclaration) {
    super(node, ConvertedSyntaxKind.ImportDeclaration);

    this.importClause = new ImportClause(node.importClause);
    this.moduleSpecifier = convertExpression(node.moduleSpecifier);
  }
}

class ImportClause extends Node {
  name?: string;
  namedBindings?: NamespaceImport|NamedImports;
  constructor(node: ts.ImportClause) {
    super(node, ConvertedSyntaxKind.ImportClause);
    if (node.name) {
      this.name = convertName(node.name);
    }
    if (ts.isNamespaceImport(node.namedBindings)) {
      this.namedBindings = new NamespaceImport(node.namedBindings);
    } else if (ts.isNamedImports(node.namedBindings)) {
      this.namedBindings = new NamedImports(node.namedBindings);
    }
  }
}

class NamespaceImport extends Node {
  private name: string;

  constructor(node: ts.NamespaceImport) {
    super(node, ConvertedSyntaxKind.NamespaceImport);
    this.name = convertName(node.name);
  }
}

class NamedImports extends Node {
  private name: string;
  private elements: ImportSpecifier[];

  constructor(node: ts.NamedImports) {
    super(node, ConvertedSyntaxKind.NamedImports);

    this.elements = node.elements.map((element: ts.ImportSpecifier) => {
      return new ImportSpecifier(element);
    });
  }
}

class ImportSpecifier extends NamedDeclaration {
  private propertyName?: string;

  constructor(node: ts.ImportSpecifier) {
    super(node, ConvertedSyntaxKind.ImportSpecifier);

    if (node.propertyName) {
      this.propertyName = node.propertyName.text;
    }
  }
}
