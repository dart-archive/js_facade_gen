import {SourceFile as tsSourceFile} from 'typescript';

import {convertNode, filterUndefined} from './conversions';
import {ConvertedSyntaxKind} from './converted_syntax_kinds';
import {Node} from './node';

export class SourceFile extends Node {
  private fileName: string;
  private statements: Node[];

  constructor(file: tsSourceFile) {
    super(file, ConvertedSyntaxKind.SourceFile);
    this.fileName = file.fileName;
    this.statements = file.statements.map(convertNode).filter(filterUndefined);
  }
}
