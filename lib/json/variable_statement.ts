import {NodeFlags as tsNodeFlags, VariableStatement as tsVariableStatement} from 'typescript';

import {convertNode, filterUndefined} from './conversions';
import {ConvertedSyntaxKind} from './converted_syntax_kinds';
import {Node} from './node';

export class VariableStatement extends Node {
  private keyword: 'var'|'let'|'const';
  declarations: Node[];
  constructor(node: tsVariableStatement) {
    super(node, ConvertedSyntaxKind.VariableStatement);

    const flags = node.declarationList.flags;
    if (flags & tsNodeFlags.Const) {
      this.keyword = 'const';
    } else if (flags & tsNodeFlags.Let) {
      this.keyword = 'let';
    } else {
      this.keyword = 'var';
    }
    this.declarations = node.declarationList.declarations.map(convertNode).filter(filterUndefined);
  }
}
