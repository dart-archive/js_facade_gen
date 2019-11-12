import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter, fixupIdentifierName} from './facade_converter';
import {Transpiler} from './main';

export default class TypeTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    if (base.isTypeNode(node)) {
      this.emit(this.fc.generateDartTypeName(<ts.TypeNode>node));
      return true;
    }
    if (ts.isTypeAssertion(node)) {
      let typeAssertExpr = <ts.TypeAssertion>node;
      if (this.isReifiedTypeLiteral(typeAssertExpr)) {
        this.visit(typeAssertExpr.expression);
        // type is handled by the container literal itself.
      }
      this.emit('(');
      this.visit(typeAssertExpr.expression);
      this.emit('as');
      this.visit(typeAssertExpr.type);
      this.emit(')');
    } else if (ts.isTypeParameterDeclaration(node)) {
      let typeParam = node;
      this.visit(typeParam.name);
      if (typeParam.constraint) {
        this.emit('extends');
        this.visit(typeParam.constraint);
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      this.visit(node.expression);
      this.emit('.');
      this.fc.visitTypeName(node.name);
    } else if (ts.isQualifiedName(node)) {
      // TODO(jacobr): there is overlap between this case and
      // generateDartTypeName in facade_converter.
      let first = node;
      let match = this.fc.lookupCustomDartTypeName(first);
      if (match) {
        this.emitType(match.name, match.comment);
      }
      this.visit(first.left);
      this.emit('.');
      this.visit(first.right);
    } else if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
      const text = fixupIdentifierName(node);
      this.emit(text);
    } else {
      return false;
    }
    return true;
  }

  isReifiedTypeLiteral(node: ts.TypeAssertion): boolean {
    if (node.expression.kind === ts.SyntaxKind.ArrayLiteralExpression &&
        node.type.kind === ts.SyntaxKind.ArrayType) {
      return true;
    } else if (
        node.expression.kind === ts.SyntaxKind.ObjectLiteralExpression &&
        node.type.kind === ts.SyntaxKind.TypeLiteral) {
      return true;
    }
    return false;
  }
}
