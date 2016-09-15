import * as dartStyle from 'dart-style';
import * as ts from 'typescript';

import {OutputContext, Transpiler} from './main';

export type ClassLike = ts.ClassDeclaration | ts.InterfaceDeclaration;
export type NamedDeclaration = ClassLike | ts.PropertyDeclaration | ts.VariableDeclaration |
    ts.MethodDeclaration | ts.ModuleDeclaration | ts.FunctionDeclaration;

export type Set = {
  [s: string]: boolean
};

export function ident(n: ts.Node): string {
  if (n.kind === ts.SyntaxKind.Identifier) return (<ts.Identifier>n).text;
  if (n.kind === ts.SyntaxKind.QualifiedName) {
    let qname = (<ts.QualifiedName>n);
    let leftName = ident(qname.left);
    if (leftName) return leftName + '.' + ident(qname.right);
  }
  return null;
}

export function isFunctionTypedefLikeInterface(ifDecl: ts.InterfaceDeclaration): boolean {
  return ifDecl.members && ifDecl.members.length === 1 &&
      ifDecl.members[0].kind === ts.SyntaxKind.CallSignature;
}

export function getDeclaration(type: ts.Type): ts.Declaration {
  let symbol = type.getSymbol();
  if (!symbol) return null;
  if (symbol.valueDeclaration) return symbol.valueDeclaration;
  return symbol.declarations && symbol.declarations.length > 0 ? symbol.declarations[0] : null;
}

export function isExtendsClause(heritageClause: ts.HeritageClause) {
  return heritageClause.token === ts.SyntaxKind.ExtendsKeyword &&
      heritageClause.parent.kind !== ts.SyntaxKind.InterfaceDeclaration;
}
export function isConstructor(n: ts.Node): boolean {
  return n.kind === ts.SyntaxKind.Constructor || n.kind === ts.SyntaxKind.ConstructSignature;
}

export function isStatic(n: ts.Node): boolean {
  let hasStatic = false;
  ts.forEachChild(n, (child) => {
    if (child.kind === ts.SyntaxKind.StaticKeyword) {
      hasStatic = true;
    }
  });
  return hasStatic;
}

export function isCallableType(type: ts.TypeNode, tc: ts.TypeChecker): boolean {
  if (isFunctionType(type, tc)) return true;
  if (type.kind === ts.SyntaxKind.TypeReference) {
    if (tc.getSignaturesOfType(tc.getTypeAtLocation(type), ts.SignatureKind.Call).length > 0)
      return true;
  }
  return false;
}

export function isFunctionType(type: ts.TypeNode, tc: ts.TypeChecker): boolean {
  let kind = type.kind;
  if (kind === ts.SyntaxKind.FunctionType) return true;
  if (kind === ts.SyntaxKind.TypeReference) {
    let t = tc.getTypeAtLocation(type);
    if (t.symbol && t.symbol.flags & ts.SymbolFlags.Function) return true;
  }

  if (kind === ts.SyntaxKind.UnionType) {
    let types = (<ts.UnionTypeNode>type).types;
    for (let i = 0; i < types.length; ++i) {
      if (!isFunctionType(types[i], tc)) {
        return false;
      }
    }
    return true;
  }
  // Warning: if the kind is a reference type and the reference is to an
  // interface that only has a call member we will not return that it is a
  // function type.
  if (kind === ts.SyntaxKind.TypeLiteral) {
    let members = (<ts.TypeLiteralNode>type).members;
    for (let i = 0; i < members.length; ++i) {
      if (members[i].kind !== ts.SyntaxKind.CallSignature) {
        return false;
      }
    }
    return true;
  }
  return false;
}

export function isTypeNode(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.UnionType:
    case ts.SyntaxKind.TypeReference:
    case ts.SyntaxKind.TypeLiteral:
    case ts.SyntaxKind.LastTypeNode:
    case ts.SyntaxKind.ArrayType:
    case ts.SyntaxKind.TypePredicate:
    case ts.SyntaxKind.TypeQuery:
    case ts.SyntaxKind.TupleType:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.FunctionType:
      return true;
    default:
      return false;
  }
}

export function isCallable(decl: ClassLike): boolean {
  let members = decl.members as Array<ts.ClassElement>;
  return members.some((member) => { return member.kind === ts.SyntaxKind.CallSignature; });
}

export function copyLocation(src: ts.TextRange, dest: ts.TextRange) {
  dest.pos = src.pos;
  dest.end = src.end;
}

// Polyfill for ES6 Array.find.
export function arrayFindPolyfill<T>(
    nodeArray: ts.NodeArray<T>, predicate: (node: T) => boolean): T {
  for (let i = 0; i < nodeArray.length; ++i) {
    if (predicate(nodeArray[i])) return nodeArray[i];
  }
  return null;
}

export function getAncestor(n: ts.Node, kind: ts.SyntaxKind): ts.Node {
  for (let parent = n; parent; parent = parent.parent) {
    if (parent.kind === kind) return parent;
  }
  return null;
}

export function getEnclosingClass(n: ts.Node): ClassLike {
  for (let parent = n.parent; parent; parent = parent.parent) {
    if (parent.kind === ts.SyntaxKind.ClassDeclaration ||
        parent.kind === ts.SyntaxKind.InterfaceDeclaration) {
      return <ClassLike>parent;
    }
  }
  return null;
}

export function isConstCall(node: ts.CallExpression): boolean {
  return node && ident(node.expression) === 'CONST_EXPR';
}

export function isInsideConstExpr(node: ts.Node): boolean {
  return isConstCall(<ts.CallExpression>getAncestor(node, ts.SyntaxKind.CallExpression));
}

export function formatType(s: string, comment: string, insideCodeComment: boolean): string {
  if (!comment) {
    return s;
  } else if (insideCodeComment) {
    // When inside a comment we only need to emit the comment version which
    // is the syntax we would like to use if Dart supported all language
    // features we would like to use for interop.
    return comment;
  } else {
    let sb = s + '/*';
    // Check if the comment is a valid type name in which case it is safe to use the Dart code
    // written in comments syntax.
    const stubToMakeTypeValidStatement = ' DUMMY_VARIABLE_NAME;';
    comment = comment.trim();
    let statement = comment + stubToMakeTypeValidStatement;
    let result = dartStyle.formatCode(statement);

    if (!result.error) {
      result.code = result.code.trim();
      let expectedStubIndex = result.code.length - stubToMakeTypeValidStatement.length;
      if (result.code.lastIndexOf(stubToMakeTypeValidStatement) === expectedStubIndex) {
        comment = result.code.substring(0, expectedStubIndex).trim();
        sb += '=';
      }
    }
    sb += comment;
    sb += '*/';
    return sb;
  }
}

export class TranspilerBase {
  private idCounter: number = 0;
  constructor(protected transpiler: Transpiler) {}

  visit(n: ts.Node) { this.transpiler.visit(n); }
  pushContext(context: OutputContext) { this.transpiler.pushContext(context); }
  popContext() { this.transpiler.popContext(); }
  emit(s: string) { this.transpiler.emit(s); }
  emitNoSpace(s: string) { this.transpiler.emitNoSpace(s); }
  emitType(s: string, comment: string) { this.transpiler.emitType(s, comment); }
  maybeLineBreak() { return this.transpiler.maybeLineBreak(); }
  enterCodeComment() { return this.transpiler.enterCodeComment(); }
  exitCodeComment() { return this.transpiler.exitCodeComment(); }
  get insideCodeComment() { return this.transpiler.insideCodeComment; }

  emitImport(toEmit: string) {
    if (!this.transpiler.importsEmitted[toEmit]) {
      this.pushContext(OutputContext.Import);
      this.emit(`import "${toEmit}";`);
      this.transpiler.importsEmitted[toEmit] = true;
      this.popContext();
    }
  }

  reportError(n: ts.Node, message: string) { this.transpiler.reportError(n, message); }

  visitNode(n: ts.Node): boolean { throw new Error('not implemented'); }

  visitEach(nodes: ts.Node[]) { nodes.forEach((n) => this.visit(n)); }

  visitEachIfPresent(nodes?: ts.Node[]) {
    if (nodes) this.visitEach(nodes);
  }

  visitList(nodes: ts.Node[], separator = ',') {
    for (let i = 0; i < nodes.length; i++) {
      this.visit(nodes[i]);
      if (i < nodes.length - 1) this.emitNoSpace(separator);
    }
  }

  uniqueId(name: string): string {
    const id = this.idCounter++;
    return `_${name}\$\$js_facade_gen\$${id}`;
  }

  assert(c: ts.Node, condition: boolean, reason: string): void {
    if (!condition) {
      this.reportError(c, reason);
      throw new Error(reason);
    }
  }

  getAncestor(n: ts.Node, kind: ts.SyntaxKind): ts.Node {
    for (let parent = n; parent; parent = parent.parent) {
      if (parent.kind === kind) return parent;
    }
    return null;
  }

  hasAncestor(n: ts.Node, kind: ts.SyntaxKind): boolean { return !!getAncestor(n, kind); }

  hasAnnotation(decorators: ts.NodeArray<ts.Decorator>, name: string): boolean {
    if (!decorators) return false;
    return decorators.some((d) => {
      let decName = ident(d.expression);
      if (decName === name) return true;
      if (d.expression.kind !== ts.SyntaxKind.CallExpression) return false;
      let callExpr = (<ts.CallExpression>d.expression);
      decName = ident(callExpr.expression);
      return decName === name;
    });
  }

  hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
    return n && (n.flags & flag) !== 0 || false;
  }

  getRelativeFileName(fileName: string): string {
    return this.transpiler.getRelativeFileName(fileName);
  }

  maybeVisitTypeArguments(n: {typeArguments?: ts.NodeArray<ts.TypeNode>}) {
    if (n.typeArguments) {
      // If it's a single type argument `<void>`, ignore it and emit nothing.
      // This is particularly useful for `Promise<void>`, see
      // https://github.com/dart-lang/sdk/issues/2231#issuecomment-108313639
      if (n.typeArguments.length === 1 && n.typeArguments[0].kind === ts.SyntaxKind.VoidKeyword) {
        return;
      }
      this.emitNoSpace('<');
      this.visitList(n.typeArguments);
      this.emitNoSpace('>');
    }
  }

  visitParameters(parameters: ts.ParameterDeclaration[]) {
    this.emitNoSpace('(');
    let firstInitParamIdx = 0;
    for (; firstInitParamIdx < parameters.length; firstInitParamIdx++) {
      // ObjectBindingPatterns are handled within the parameter visit.
      let isOpt = parameters[firstInitParamIdx].initializer ||
          parameters[firstInitParamIdx].questionToken ||
          parameters[firstInitParamIdx].dotDotDotToken;
      if (isOpt && parameters[firstInitParamIdx].name.kind !== ts.SyntaxKind.ObjectBindingPattern) {
        break;
      }
    }

    if (firstInitParamIdx !== 0) {
      let requiredParams = parameters.slice(0, firstInitParamIdx);
      this.visitList(requiredParams);
    }

    if (firstInitParamIdx !== parameters.length) {
      if (firstInitParamIdx !== 0) this.emitNoSpace(',');
      let positionalOptional = parameters.slice(firstInitParamIdx, parameters.length);
      this.emit('[');
      this.visitList(positionalOptional);
      this.emitNoSpace(']');
    }

    this.emitNoSpace(')');
  }
}
