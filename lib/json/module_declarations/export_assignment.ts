import {ExportAssignment as tsExportAssignment} from 'typescript';
import {convertExpression, convertName} from '../conversions';
import {ConvertedSyntaxKind} from '../converted_syntax_kinds';
import {Node} from '../node';

/**
 * This is either an `export =` or an `export default` declaration.
 * Unless `isExportEquals` is set, this node was parsed as an `export default`.
 */
export class ExportAssignment extends Node {
  private name?: string;
  private isExportEquals = false;
  private expression: string;

  constructor(node: tsExportAssignment) {
    super(node, ConvertedSyntaxKind.ExportAssignment);

    if (node.name) {
      this.name = convertName(node.name);
    }
    if (node.isExportEquals) {
      this.isExportEquals = true;
    }
    this.expression = convertExpression(node.expression);
  }
}
