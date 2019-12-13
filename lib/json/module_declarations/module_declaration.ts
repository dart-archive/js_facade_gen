import * as ts from 'typescript';

import {convertName, convertNode, filterUndefined} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Node} from '../node';

export class ModuleDeclaration extends Node {
  private name: string;
  private body?: ModuleBlock|ModuleDeclaration;
  constructor(node: ts.ModuleDeclaration) {
    super(node, ConvertedSyntaxKind.ModuleDeclaration);

    this.name = convertName(node.name);
    if (node.body && ts.isModuleBlock(node.body)) {
      this.body = new ModuleBlock(node.body);
    } else if (node.body && ts.isModuleDeclaration(node.body)) {
      this.body = new ModuleDeclaration(node.body);
    }
  }
}

class ModuleBlock extends Node {
  private statements: Node[];
  constructor(node: ts.ModuleBlock) {
    super(node, ConvertedSyntaxKind.ModuleBlock);

    this.statements = node.statements.map(convertNode).filter(filterUndefined);
  }
}
