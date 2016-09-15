import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter, fixupIdentifierName} from './facade_converter';
import {Transpiler} from './main';

export default class TypeTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter) { super(tr); }

  visitNode(node: ts.Node): boolean {
    if (base.isTypeNode(node)) {
      this.emit(this.fc.generateDartTypeName(<ts.TypeNode>node, this.insideCodeComment));
      return true;
    }
    switch (node.kind) {
      case ts.SyntaxKind.TypeAssertionExpression:
        let typeAssertExpr = <ts.TypeAssertion>node;
        if (this.isReifiedTypeLiteral(typeAssertExpr)) {
          this.visit(typeAssertExpr.expression);
          break;  // type is handled by the container literal itself.
        }
        this.emit('(');
        this.visit(typeAssertExpr.expression);
        this.emit('as');
        this.visit(typeAssertExpr.type);
        this.emit(')');
        break;
      case ts.SyntaxKind.TypeParameter:
        let typeParam = <ts.TypeParameterDeclaration>node;
        this.visit(typeParam.name);
        if (typeParam.constraint) {
          this.emit('extends');
          this.visit(typeParam.constraint);
        }
        break;
      case ts.SyntaxKind.QualifiedName:
        // TODO(jacobr): there is overlap between this case and
        // generateDartTypeName in facade_converter.
        let first = <ts.QualifiedName>node;
        let match = this.fc.lookupCustomDartTypeName(first, this.insideCodeComment);
        if (match) {
          this.emitType(match.name, match.comment);
          break;
        }
        this.visit(first.left);
        this.emit('.');
        this.visit(first.right);
        break;
      case ts.SyntaxKind.Identifier:
        let ident = <ts.Identifier>node;
        let text = fixupIdentifierName(ident.text);
        this.emit(text);
        break;
      // TODO(jacobr): all these cases might be obsolete.
      case ts.SyntaxKind.NumberKeyword:
        this.emit('num');
        break;
      case ts.SyntaxKind.StringKeyword:
        this.emit('String');
        break;
      case ts.SyntaxKind.VoidKeyword:
        this.emit('void');
        break;
      case ts.SyntaxKind.BooleanKeyword:
        this.emit('bool');
        break;
      case ts.SyntaxKind.AnyKeyword:
        this.emit('dynamic');
        break;
      default:
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
