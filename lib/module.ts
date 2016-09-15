import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter} from './facade_converter';
import {OutputContext, Transpiler} from './main';

export default class ModuleTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter, private generateLibraryName: boolean) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        this.pushContext(OutputContext.Import);
        this.emit('@JS()');
        this.emit('library');
        this.emit(this.getLibraryName());
        this.emit(';');
        this.popContext();

        this.emitImport('package:js/js.dart');
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.EndOfFileToken:
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.ImportDeclaration:
        let importDecl = <ts.ImportDeclaration>node;
        if (importDecl.importClause) {
          if (this.isEmptyImport(importDecl)) return true;
          this.emit('import');
          this.visitExternalModuleReferenceExpr(importDecl.moduleSpecifier);
          this.visit(importDecl.importClause);
        } else {
          this.reportError(importDecl, 'bare import is unsupported');
        }
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportClause:
        let importClause = <ts.ImportClause>node;
        if (importClause.name) this.fc.visitTypeName(importClause.name);
        if (importClause.namedBindings) {
          this.visit(importClause.namedBindings);
        }
        break;
      case ts.SyntaxKind.NamespaceImport:
        let nsImport = <ts.NamespaceImport>node;
        this.emit('as');
        this.fc.visitTypeName(nsImport.name);
        break;
      case ts.SyntaxKind.NamedImports:
        this.emit('show');
        let used = this.filterImports((<ts.NamedImports>node).elements);
        if (used.length === 0) {
          this.reportError(node, 'internal error, used imports must not be empty');
        }
        this.visitList(used);
        break;
      case ts.SyntaxKind.NamedExports:
        let exportElements = (<ts.NamedExports>node).elements;
        this.emit('show');
        if (exportElements.length === 0) this.reportError(node, 'empty export list');
        this.visitList((<ts.NamedExports>node).elements);
        break;
      case ts.SyntaxKind.ImportSpecifier:
      case ts.SyntaxKind.ExportSpecifier:
        let spec = <ts.ImportOrExportSpecifier>node;
        if (spec.propertyName) {
          this.reportError(spec.propertyName, 'import/export renames are unsupported in Dart');
        }
        this.fc.visitTypeName(spec.name);
        break;
      case ts.SyntaxKind.ExportDeclaration:
        let exportDecl = <ts.ExportDeclaration>node;
        this.emit('export');
        if (exportDecl.moduleSpecifier) {
          this.visitExternalModuleReferenceExpr(exportDecl.moduleSpecifier);
        } else {
          this.reportError(node, 're-exports must have a module URL (export x from "./y").');
        }
        if (exportDecl.exportClause) this.visit(exportDecl.exportClause);
        this.emit(';');
        break;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        let importEqDecl = <ts.ImportEqualsDeclaration>node;
        this.pushContext(OutputContext.Import);
        this.emit('import');
        this.visit(importEqDecl.moduleReference);
        this.emit('as');
        this.fc.visitTypeName(importEqDecl.name);
        this.emit(';');
        this.popContext();
        break;
      case ts.SyntaxKind.ExternalModuleReference:
        this.visitExternalModuleReferenceExpr((<ts.ExternalModuleReference>node).expression);
        break;

      default:
        return false;
    }
    return true;
  }

  private static isIgnoredImport(e: ts.ImportSpecifier) { return false; }

  private visitExternalModuleReferenceExpr(expr: ts.Expression) {
    // TODO: what if this isn't a string literal?
    let moduleName = <ts.StringLiteral>expr;
    let text = moduleName.text;
    if (text.match(/^\.\//)) {
      // Strip './' to be more Dart-idiomatic.
      text = text.substring(2);
    } else if (!text.match(/^\.\.\//)) {
      // Unprefixed imports are package imports.
      text = 'package:' + text;
    }
    this.emit(JSON.stringify(text + '.dart'));
  }

  private isEmptyImport(n: ts.ImportDeclaration): boolean {
    let bindings = n.importClause.namedBindings;
    if (bindings.kind !== ts.SyntaxKind.NamedImports) return false;
    let elements = (<ts.NamedImports>bindings).elements;
    if (elements.length === 0) return true;
    return elements.every(ModuleTranspiler.isIgnoredImport);
  }

  private filterImports(ns: ts.ImportOrExportSpecifier[]) {
    return ns.filter((e) => !ModuleTranspiler.isIgnoredImport(e));
  }

  getLibraryName(nameForTest?: string) {
    let fileName = this.getRelativeFileName(nameForTest);
    let parts = fileName.split('/');
    return parts.filter((p) => p.length > 0)
        .map((p) => p.replace(/[^\w.]/g, '_'))
        .map((p) => p.replace(/\.d\.ts$/g, ''))
        .map((p) => p.replace(/\.[jt]s$/g, ''))
        .map((p) => p.replace(/\./g, ''))
        .map((p) => FacadeConverter.DART_RESERVED_WORDS.indexOf(p) !== -1 ? '_' + p : p)
        .filter((p) => p.length > 0)
        .join('.');
  }
}
