import * as dartStyle from 'dart-style';
import * as path from 'path';
import * as ts from 'typescript';

import {OutputContext, Transpiler} from './main';

/**
 * Map from identifier name to resolved type.
 * Example: 'E' should map to a TypeNode for number when resolving a usage of MyArray<number>
 * where MyArray is the alias type:
 * type MyArray<E> = Array<T>
 */
export type ResolvedTypeMap = Map<string, ts.TypeNode>;

/***
 * Options for how TypeScript types are represented as Dart types.
 */
export interface TypeDisplayOptions {
  /// We are displaying the type inside a comment so we don't have to restrict to valid Dart syntax.
  /// For example, we can display string literal type using the regular TypeScript syntax.
  ///
  /// Example:
  /// TypeScript type: number|string
  /// Dart inside comment: num|String
  /// Dart outside comment: dynamic /* num|string */
  insideComment?: boolean;

  /// Dart has additional restrictions for what types are valid to emit inside a type argument. For
  /// example, "void" is not valid inside a type argument so Null has to be used instead.
  ///
  /// Example:
  /// TypeScript type: Foo<void>
  /// Dart inside type argument: Foo<Null>
  /// Dart outside type argument: N/A
  /// TypeScript type: bar():void
  /// Dart inside type argument: N/A
  /// Dart outside type argument: void bar();
  insideTypeArgument?: boolean;

  /// Indicates that we should not append an additional comment indicating what the true TypeScript
  /// type was for cases where Dart cannot express the type precisely.
  ///
  /// Example:
  /// TypeScript type: number|string
  /// Dart hide comment: dynamic
  /// Dart show comment: dynamic /*number|string*/
  hideComment?: boolean;

  /**
   * Type arguments associated with the current type to display.
   * Arguments are emitted directly in normal cases but in the case of type aliases we have to
   * propagate and substitute type arguments.
   */
  typeArguments?: ts.NodeArray<ts.TypeNode>;

  /**
   * Parameter declarations to substitute. This is required to support type aliases with type
   * arguments that are not representable in Dart.
   */
  resolvedTypeArguments?: ResolvedTypeMap;
}

/**
 * Summary information on what is imported via a particular import.
 */
export class ImportSummary {
  showAll = false;
  shown: Set<String> = new Set();
  asPrefix: string;
}

export type Constructor = ts.ConstructorDeclaration|ts.ConstructSignatureDeclaration;
export type ClassLike = ts.ClassLikeDeclaration|ts.InterfaceDeclaration;

/**
 * Interface extending the true InterfaceDeclaration interface to add optional state we store on
 * interfaces to simplify conversion to Dart classes.
 */
export interface ExtendedInterfaceDeclaration extends ts.InterfaceDeclaration {
  /**
   * The type associated with this interface that we want to treat as the concrete location of this
   * interface to enable interfaces that act like constructors. Because Dart does not permit calling
   * objects like constructors we have to add this workaround.
   */
  constructedType?: ts.InterfaceDeclaration|ts.TypeLiteralNode;
}

export function ident(n: ts.Node): string {
  if (ts.isIdentifier(n) || ts.isStringLiteralLike(n)) {
    return n.text;
  }
  if (ts.isQualifiedName(n)) {
    const leftName = ident(n.left);
    if (leftName) {
      return leftName + '.' + ident(n.right);
    }
  }
  return null;
}

export function isFunctionTypedefLikeInterface(ifDecl: ts.InterfaceDeclaration): boolean {
  return ifDecl.members && ifDecl.members.length === 1 &&
      ts.isCallSignatureDeclaration(ifDecl.members[0]);
}

export function isExtendsClause(heritageClause: ts.HeritageClause) {
  return heritageClause.token === ts.SyntaxKind.ExtendsKeyword &&
      !ts.isInterfaceDeclaration(heritageClause.parent);
}

export function isConstructor(n: ts.Node): n is Constructor {
  return ts.isConstructorDeclaration(n) || ts.isConstructSignatureDeclaration(n);
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

export function isReadonly(n: ts.Node): boolean {
  let hasReadonly = false;
  ts.forEachChild(n, (child) => {
    if (child.kind === ts.SyntaxKind.ReadonlyKeyword) {
      hasReadonly = true;
    }
  });
  return hasReadonly;
}

export function isCallableType(type: ts.TypeNode, tc: ts.TypeChecker): boolean {
  if (isFunctionType(type, tc)) return true;
  if (ts.isTypeReferenceNode(type)) {
    if (tc.getSignaturesOfType(tc.getTypeAtLocation(type), ts.SignatureKind.Call).length > 0)
      return true;
  }
  return false;
}

/**
 * Returns whether a type declaration is on we can generate a named Dart type for.
 * For unsupported alias types we need to manually substitute the expression
 * the alias corresponds to in call sites.
 */
export function supportedTypeDeclaration(decl: ts.Declaration): boolean {
  if (ts.isTypeAliasDeclaration(decl)) {
    let type = decl.type;
    return ts.isTypeLiteralNode(type) || ts.isFunctionTypeNode(type);
  }
  return true;
}

export function isFunctionType(type: ts.TypeNode, tc: ts.TypeChecker): boolean {
  if (ts.isFunctionTypeNode(type)) return true;
  if (ts.isTypeReferenceNode(type)) {
    let t = tc.getTypeAtLocation(type);
    if (t.symbol && t.symbol.flags & ts.SymbolFlags.Function) return true;
  }

  if (ts.isIntersectionTypeNode(type)) {
    let types = type.types;
    for (let i = 0; i < types.length; ++i) {
      if (isFunctionType(types[i], tc)) {
        return true;
      }
    }
    return false;
  }

  if (ts.isUnionTypeNode(type)) {
    let types = type.types;
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
  if (ts.isTypeLiteralNode(type)) {
    let members = type.members;
    for (let i = 0; i < members.length; ++i) {
      if (ts.isCallSignatureDeclaration(members[i])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Whether a parameter declaration is specifying information about the type of "this" passed to
 * the function instead of being a normal type parameter representable by a Dart type.
 */
export function isThisParameter(param: ts.ParameterDeclaration): boolean {
  return param.name && ts.isIdentifier(param.name) && param.name.text === 'this';
}

/**
 * Dart does not have a concept of binding the type of the "this" parameter to a method.
 */
export function filterThisParameter(params: ts.NodeArray<ts.ParameterDeclaration>):
    ts.ParameterDeclaration[] {
  let ret: ts.ParameterDeclaration[] = [];
  for (let i = 0; i < params.length; i++) {
    let param = params[i];
    if (!isThisParameter(param)) {
      ret.push(param);
    }
  }
  return ret;
}

export function isTypeNode(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.IntersectionType:
    case ts.SyntaxKind.UnionType:
    case ts.SyntaxKind.ParenthesizedType:
    case ts.SyntaxKind.TypeReference:
    case ts.SyntaxKind.TypeLiteral:
    case ts.SyntaxKind.LastTypeNode:
    case ts.SyntaxKind.LiteralType:
    case ts.SyntaxKind.ArrayType:
    case ts.SyntaxKind.TypeOperator:
    case ts.SyntaxKind.IndexedAccessType:
    case ts.SyntaxKind.MappedType:
    case ts.SyntaxKind.TypePredicate:
    case ts.SyntaxKind.TypeQuery:
    case ts.SyntaxKind.TupleType:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.NeverKeyword:
    case ts.SyntaxKind.FunctionType:
    case ts.SyntaxKind.ThisType:
      return true;
    default:
      return false;
  }
}

export function isPromise(type: ts.TypeNode): boolean {
  return type && ts.isTypeReferenceNode(type) && ident(type.typeName) === 'Promise';
}

export function isCallable(decl: ClassLike): boolean {
  let members = decl.members as ReadonlyArray<ts.ClassElement>;
  return members.some((member) => {
    return member.kind === ts.SyntaxKind.CallSignature;
  });
}

export function copyLocation(src: ts.Node, dest: ts.Node) {
  dest.pos = src.pos;
  dest.end = src.end;
  dest.parent = src.parent;
}

export function cloneNodeArray<T extends ts.Node>(src?: ts.NodeArray<T>): ts.NodeArray<T>|
    undefined {
  if (!src) {
    return undefined;
  }
  const clone = ts.createNodeArray(src.map(ts.getMutableClone));
  copyNodeArrayLocation(src, clone);
  return clone;
}

export function copyNodeArrayLocation(src: ts.TextRange, dest: ts.NodeArray<any>) {
  dest.pos = src.pos;
  dest.end = src.end;
}

export function getAncestor(n: ts.Node, kind: ts.SyntaxKind): ts.Node {
  for (let parent = n; parent; parent = parent.parent) {
    if (parent.kind === kind) return parent;
  }
  return null;
}

export function getEnclosingClass(n: ts.Node): ClassLike {
  while (n) {
    if (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) {
      return <ClassLike>n;
    }
    n = n.parent;
  }
  return null;
}

export function isConstCall(node: ts.CallExpression): boolean {
  return node && ident(node.expression) === 'CONST_EXPR';
}

export function isInsideConstExpr(node: ts.Node): boolean {
  return isConstCall(<ts.CallExpression>getAncestor(node, ts.SyntaxKind.CallExpression));
}

export function getModuleBlock(moduleDecl: ts.ModuleDeclaration): ts.ModuleBlock {
  while (ts.isModuleDeclaration(moduleDecl.body)) {
    moduleDecl = moduleDecl.body;
  }
  if (ts.isModuleBlock(moduleDecl.body)) {
    return moduleDecl.body;
  } else {
    throw new Error('Module body must be a module block.');
  }
}

/**
 * Determine the full module name including dots.
 *
 * e.g. returns 'foo.bar' for a declaration of namespace or module foo.bar
 */
export function getModuleName(moduleDecl: ts.ModuleDeclaration): string {
  let name = moduleDecl.name.text;
  while (ts.isModuleDeclaration(moduleDecl.body)) {
    moduleDecl = moduleDecl.body;
    name += '.' + moduleDecl.name.text;
  }
  return name;
}

export function formatType(s: string, comment: string, options: TypeDisplayOptions): string {
  if (!comment || options.hideComment) {
    return s;
  } else if (options.insideComment) {
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
      }
    }
    sb += comment;
    sb += '*/';
    return sb;
  }
}

export class TranspilerBase {
  private idCounter = 0;
  constructor(protected transpiler: Transpiler) {}

  visit(n: ts.Node) {
    this.transpiler.visit(n);
  }
  pushContext(context: OutputContext) {
    this.transpiler.pushContext(context);
  }
  popContext() {
    this.transpiler.popContext();
  }
  emit(s: string) {
    this.transpiler.emit(s);
  }
  emitNoSpace(s: string) {
    this.transpiler.emitNoSpace(s);
  }
  emitType(s: string, comment: string) {
    this.transpiler.emitType(s, comment);
  }
  maybeLineBreak() {
    return this.transpiler.maybeLineBreak();
  }
  enterCodeComment() {
    return this.transpiler.enterCodeComment();
  }
  exitCodeComment() {
    return this.transpiler.exitCodeComment();
  }
  maybeWrapInCodeComment({shouldWrap = true, newLine = false}, emit: () => void): void {
    if (shouldWrap) {
      this.enterCodeComment();
    }
    emit();
    if (shouldWrap) {
      this.exitCodeComment();
    }
    if (newLine) {
      this.emit('\n');
    }
  }

  enterTypeArguments() {
    this.transpiler.enterTypeArgument();
  }
  exitTypeArguments() {
    this.transpiler.exitTypeArgument();
  }
  get insideTypeArgument() {
    return this.transpiler.insideTypeArgument;
  }

  get insideCodeComment() {
    return this.transpiler.insideCodeComment;
  }

  getImportSummary(libraryUri: string): ImportSummary {
    if (!this.transpiler.imports.has(libraryUri)) {
      let summary = new ImportSummary();
      this.transpiler.imports.set(libraryUri, summary);
      return summary;
    }
    return this.transpiler.imports.get(libraryUri);
  }

  /**
   * Add an import. If an identifier is specified, only show that name.
   */
  addImport(libraryUri: string, identifier?: string): ImportSummary {
    let summary = this.getImportSummary(libraryUri);
    if (identifier) {
      summary.shown.add(identifier);
    } else {
      summary.showAll = true;
    }
    return summary;
  }

  /**
   * Return resolved name possibly including a prefix for the identifier.
   */
  resolveImportForSourceFile(sourceFile: ts.SourceFile, context: ts.SourceFile, identifier: string):
      string {
    if (sourceFile === context) {
      return identifier;
    }
    if (sourceFile.hasNoDefaultLib) {
      // We don't want to emit imports to default lib libraries as we replace with Dart equivalents
      // such as dart:html, etc.
      return identifier;
    }
    const relativePath = path.relative(path.dirname(context.fileName), sourceFile.fileName);
    const fileName = this.getDartFileName(relativePath);
    const identifierParts = identifier.split('.');
    identifier = identifierParts[identifierParts.length - 1];
    const summary = this.addImport(this.transpiler.getDartFileName(fileName), identifier);
    if (summary.asPrefix) {
      return summary.asPrefix + '.' + identifier;
    }
    return identifier;
  }


  reportError(n: ts.Node, message: string) {
    this.transpiler.reportError(n, message);
  }

  visitNode(n: ts.Node): boolean {
    throw new Error('not implemented');
  }

  visitEach(nodes: ts.NodeArray<ts.Node>) {
    nodes.forEach((n) => this.visit(n));
  }

  visitEachIfPresent(nodes?: ts.NodeArray<ts.Node>) {
    if (nodes) this.visitEach(nodes);
  }

  visitList(nodes: ts.NodeArray<ts.Node>, separator?: string) {
    separator = separator || ',';
    for (let i = 0; i < nodes.length; i++) {
      this.visit(nodes[i]);
      if (i < nodes.length - 1) this.emitNoSpace(separator);
    }
  }

  /**
   * Returns whether any parameters were actually emitted.
   */
  visitParameterList(nodes: ts.ParameterDeclaration[], namesOnly: boolean): boolean {
    let emittedParameters = false;
    for (let i = 0; i < nodes.length; ++i) {
      let param = nodes[i];
      if (!this.insideCodeComment && isThisParameter(param)) {
        // Emit the this type in a comment as it could be of interest to Dart users who are
        // calling allowInteropCaptureThis to bind a Dart method.
        this.enterCodeComment();
        this.visit(param.type);
        this.emit('this');
        this.exitCodeComment();
        continue;
      }
      if (emittedParameters) {
        this.emitNoSpace(',');
      }
      if (namesOnly) {
        this.emit(ident(param.name));
      } else {
        this.visit(param);
      }
      emittedParameters = true;
    }
    return emittedParameters;
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

  hasAncestor(n: ts.Node, kind: ts.SyntaxKind): boolean {
    return !!getAncestor(n, kind);
  }

  hasAnnotation(decorators: ts.NodeArray<ts.Decorator>, name: string): boolean {
    if (!decorators) return false;
    return decorators.some((d) => {
      let decName = ident(d.expression);
      if (decName === name) return true;
      if (!ts.isCallExpression(d.expression)) return false;
      let callExpr = d.expression;
      decName = ident(callExpr.expression);
      return decName === name;
    });
  }

  hasNodeFlag(n: ts.Declaration, flag: ts.NodeFlags): boolean {
    return n && (ts.getCombinedNodeFlags(n) & flag) !== 0 || false;
  }

  hasModifierFlag(n: ts.Declaration, flag: ts.ModifierFlags): boolean {
    return n && (ts.getCombinedModifierFlags(n) & flag) !== 0 || false;
  }

  getRelativeFileName(fileName: string): string {
    return this.transpiler.getRelativeFileName(fileName);
  }

  getDartFileName(fileName?: string): string {
    return this.transpiler.getDartFileName(fileName);
  }

  maybeVisitTypeArguments(n: {typeArguments?: ts.NodeArray<ts.TypeNode>}) {
    if (n.typeArguments) {
      this.emitNoSpace('<');
      this.enterTypeArguments();
      this.visitList(n.typeArguments);
      this.exitTypeArguments();
      this.emitNoSpace('>');
    }
  }

  visitParameters(parameters: ts.NodeArray<ts.ParameterDeclaration>, {namesOnly = false}) {
    this.emitNoSpace('(');
    let firstInitParamIdx = 0;
    for (; firstInitParamIdx < parameters.length; firstInitParamIdx++) {
      // ObjectBindingPatterns are handled within the parameter visit.
      let isOpt = parameters[firstInitParamIdx].initializer ||
          parameters[firstInitParamIdx].questionToken ||
          parameters[firstInitParamIdx].dotDotDotToken;
      if (isOpt && !ts.isObjectBindingPattern(parameters[firstInitParamIdx].name)) {
        break;
      }
    }

    let hasValidParameters = false;
    if (firstInitParamIdx !== 0) {
      let requiredParams = parameters.slice(0, firstInitParamIdx);
      hasValidParameters = this.visitParameterList(requiredParams, namesOnly);
    }

    if (firstInitParamIdx !== parameters.length) {
      if (hasValidParameters) this.emitNoSpace(',');
      let positionalOptional = parameters.slice(firstInitParamIdx, parameters.length);
      if (!namesOnly) {
        this.emit('[');
      }
      this.visitParameterList(positionalOptional, namesOnly);
      if (!namesOnly) {
        this.emitNoSpace(']');
      }
    }

    this.emitNoSpace(')');
  }
}
