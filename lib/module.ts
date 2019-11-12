import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter} from './facade_converter';
import {OutputContext, Transpiler} from './main';

export default class ModuleTranspiler extends base.TranspilerBase {
  constructor(tr: Transpiler, private fc: FacadeConverter, private moduleName: string) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
        this.pushContext(OutputContext.Import);
        let sourceFile = node as ts.SourceFile;
        let moduleName = this.moduleName;
        if (sourceFile.moduleName) {
          moduleName = sourceFile.moduleName;
        }
        sourceFile.statements.forEach((n: ts.Node) => {
          if (ts.isNamespaceExportDeclaration(n)) {
            moduleName = base.ident(n.name);
          }
        });
        if (moduleName) {
          this.emit(`@JS("${moduleName}")`);
        } else {
          this.emit('@JS()');
        }
        this.emit('library');
        this.emit(this.getLibraryName());
        this.emit(';');
        this.popContext();

        this.addImport('package:js/js.dart');
        // The declaration transpiler is responsible for emitting the contents of the source file.
        return false;
      case ts.SyntaxKind.EndOfFileToken:
        ts.forEachChild(node, this.visit.bind(this));
        break;
      case ts.SyntaxKind.ImportDeclaration:
        // Intentionally skip import clauses as we can do a better job generating imports from the
        // resolved entities referenced. This works better as there are import concepts in
        // TypeScript such as renaming imports that we cannot support in Dart.

        // TODO(jacobr): to reduce naming conflicts in complex cases we should check for
        // ImportDeclarations that have a NamespaceImport clause and use that prefix in the Dart
        // code we generating by setting the asPrefix the same as how we do for the
        // ImportEqualsDeclaration case.
        break;
      case ts.SyntaxKind.NamespaceImport:
        let nsImport = <ts.NamespaceImport>node;
        this.emit('as');
        this.emit(base.ident(nsImport.name));
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
      case ts.SyntaxKind.NamespaceExportDeclaration:
        // We handle this globally exporting all files in the packge with the specified global
        // module export location.
        break;
      case ts.SyntaxKind.ExportDeclaration:
        let exportDecl = <ts.ExportDeclaration>node;
        this.emit('export');
        if (exportDecl.moduleSpecifier) {
          this.emit(
              JSON.stringify(this.getExternalModuleReferenceExpr(exportDecl.moduleSpecifier)));
        } else {
          this.reportError(node, 're-exports must have a module URL (export x from "./y").');
        }
        if (exportDecl.exportClause) this.visit(exportDecl.exportClause);
        this.emit(';\n');
        break;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        // We could ignore ImportEqualsDeclarations and but we track them to make the Dart output
        // look more visually similar to the input.
        let importEqDecl = <ts.ImportEqualsDeclaration>node;
        let fileName = this.getExternalModuleReferenceExpr(importEqDecl.moduleReference);
        this.getImportSummary(fileName).asPrefix = base.ident(importEqDecl.name);
        break;

      default:
        return false;
    }
    return true;
  }

  private isIgnoredImport(e: ts.ImportSpecifier): boolean {
    // We need to hide import import specifiers that reference names that are not actually exported
    // by Dart. Currently this means suppressing unsupported type aliases.
    let s: ts.Symbol = this.fc.tc.getSymbolAtLocation(e.name);
    s = this.fc.tc.getAliasedSymbol(s);
    if (!s || !s.declarations) return false;
    let decl = s.declarations[0];
    if (!decl) return false;
    return !base.supportedTypeDeclaration(decl);
  }

  private getExternalModuleReferenceExpr(expr: ts.Node): string {
    if (ts.isExternalModuleReference(expr)) {
      expr = expr.expression;
    }
    if (!ts.isStringLiteral(expr)) {
      this.reportError(expr, 'Unexpected module reference type:' + expr.kind);
    }
    let moduleName = <ts.StringLiteral>expr;
    let text = moduleName.text;
    // TODO(jacobr): actually handle files in different directories. We assume for now that all
    // files in a library will be output to a single directory for codegen simplicity.
    let parts = text.split('/');
    text = parts[parts.length - 1];

    return text + '.dart';
  }

  private filterImports(ns: ts.NodeArray<ts.ImportSpecifier>) {
    let that = this;
    return ts.createNodeArray(ns.filter((e) => !that.isIgnoredImport(e)));
  }

  getLibraryName(jsFileName?: string) {
    let fileName = this.getDartFileName(jsFileName);
    let parts = fileName.split('/');
    return parts.filter((p) => p.length > 0 && p !== '..')
        .map((p) => p.replace(/[^\w.]/g, '_'))
        .map((p) => p.replace(/\.dart$/, ''))
        .map((p) => FacadeConverter.DART_RESERVED_WORDS.has(p) ? '_' + p : p)
        .filter((p) => p.length > 0)
        .join('.');
  }
}
