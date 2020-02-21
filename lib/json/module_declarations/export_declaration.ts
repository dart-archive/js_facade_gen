import {ExportDeclaration as tsExportDeclaration, ExportSpecifier as tsExportSpecifier, NamedExports as tsNamedExports} from 'typescript';

import {convertExpression} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {NamedDeclaration} from '../named_declarations';
import {Node} from '../node';

export class ExportDeclaration extends Node {
  private exportClause?: NamedExports;
  private moduleSpecifier?: string;
  constructor(node: tsExportDeclaration) {
    super(node, ConvertedSyntaxKind.ExportDeclaration);

    if (node.exportClause) {
      this.exportClause = new NamedExports(node.exportClause as tsNamedExports);
    }
    if (node.moduleSpecifier) {
      this.moduleSpecifier = convertExpression(node.moduleSpecifier);
    }
  }
}

class NamedExports extends Node {
  elements: ExportSpecifier[];
  constructor(node: tsNamedExports) {
    super(node, ConvertedSyntaxKind.NamedExports);
    this.elements = node.elements.map((element: tsExportSpecifier) => {
      return new ExportSpecifier(element);
    });
  }
}

class ExportSpecifier extends NamedDeclaration {
  private propertyName?: string;

  constructor(node: tsExportSpecifier) {
    super(node, ConvertedSyntaxKind.ExportSpecifier);

    if (node.propertyName) {
      this.propertyName = node.propertyName.text;
    }
  }
}
