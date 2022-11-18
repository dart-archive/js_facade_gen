import {relative} from 'path';
import * as ts from 'typescript';

import * as base from './base';
import {TypeDisplayOptions} from './base';
import {DART_LIBRARIES_FOR_BROWSER_TYPES, TS_TO_DART_TYPENAMES} from './dart_libraries_for_browser_types';
import {Transpiler} from './main';
import {MergedType} from './merge';

const FACADE_DEBUG = false;
const FACADE_NODE_MODULES_PREFIX = /^(\.\.\/)*node_modules\//;

/**
 * Prefix to add to a variable name that leaves the JS name referenced
 * unchanged.
 */
export const DART_RESERVED_NAME_PREFIX = 'JS$';

/**
 * Returns whether or not the given identifier is valid for the type of object it refers to. Certain
 * reserved keywords cannot ever be used as identifiers. Other keywords, the built-in identifiers,
 * cannot be used as class or type names, but can be used elsewhere.
 */
export function isValidIdentifier(identifier: ts.DeclarationName|ts.PropertyName): boolean {
  // Check if this identifier is being used as a class or type name
  const parent = identifier.parent;

  const isClassOrTypeName = parent &&
      (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeNode(parent));

  const text = base.ident(identifier);
  if (FacadeConverter.DART_RESERVED_WORDS.has(text)) {
    return false;
  }
  if (isClassOrTypeName && FacadeConverter.DART_BUILT_IN_IDENTIFIERS.has(text)) {
    return false;
  }

  const validIdentifierRegExp = new RegExp('^[^0-9_][a-zA-Z0-9_$]*$');
  return validIdentifierRegExp.test(text);
}

export function identifierCanBeRenamed(identifier: ts.DeclarationName|ts.PropertyName): boolean {
  const text = base.ident(identifier);
  const renamableRegExp = new RegExp('^[a-zA-Z0-9_$]*$');
  return renamableRegExp.test(text);
}

/**
 * Fix TypeScript identifier names that are not valid Dart names by adding JS$ to the start of the
 * identifier name.
 */
export function fixupIdentifierName(node: ts.DeclarationName|ts.PropertyName): string {
  const text = base.ident(node);

  if (isValidIdentifier(node)) {
    // If the name is already valid, it does not need to be changed
    return text;
  } else if (identifierCanBeRenamed(node)) {
    // If the identifier will become valid by prepending JS$ to it, return that name
    return DART_RESERVED_NAME_PREFIX + text;
  }
  // If the name cannot be renamed to be valid, it remains unmodified. The Declaration transpiler
  // should have detected the invalid name and wrapped it in a code comment.
  return text;
}

function hasVarArgs(parameters: ts.ParameterDeclaration[]): boolean {
  for (let i = 0; i < parameters.length; ++i) {
    if (parameters[i].dotDotDotToken) return true;
  }
  return false;
}

/**
 * Generates the JavaScript expression required to reference the node
 * from the global context. InterfaceDeclarations do not technically correspond
 * to actual JavaScript objects but we still generate a reference path for them
 * so that we have a guaranteed unique name.
 *
 * Example JS path:
 * module m1 {
 *   module m2 {
 *     class foo { }
 *   }
 * }
 * Path: m1.m2.foo
 */
function fullJsPath(node: ts.NamedDeclaration): string {
  const parts: Array<string> = [base.ident(node.name)];
  let p: ts.Node = node.parent;
  while (p != null) {
    if (ts.isModuleDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isClassDeclaration(p)) {
      parts.unshift(base.ident(p.name));
    }
    p = p.parent;
  }
  return parts.join('.');
}

class DartNameRecord {
  name: string;
  constructor(private node: ts.Node, name: string, private library: DartLibrary) {
    this.name = name;
  }
}

export class DartLibrary {
  constructor(private fileName: string) {
    this.usedNames = new Set();
  }

  /**
   * @returns {boolean} whether the name was added.
   */
  addName(name: string): boolean {
    if (this.usedNames.has(name)) {
      return false;
    }
    this.usedNames.add(name);
    return true;
  }

  private usedNames: Set<String>;
}

// TODO(jacobr): track name conflicts better and add library prefixes to avoid them.
export class NameRewriter {
  private dartTypes: Map<String, DartNameRecord> = new Map();
  // TODO(jacobr): we aren't really using this well.
  private libraries: Map<String, DartLibrary> = new Map();

  constructor(private fc: FacadeConverter) {}

  private computeName(node: ts.NamedDeclaration): DartNameRecord {
    const fullPath = fullJsPath(node);
    if (this.dartTypes.has(fullPath)) {
      return this.dartTypes.get(fullPath);
    }
    const sourceFile = <ts.SourceFile>base.getAncestor(node, ts.SyntaxKind.SourceFile);
    const fileName = sourceFile.fileName;
    let library: DartLibrary;
    if (this.libraries.has(fileName)) {
      library = this.libraries.get(fileName);
    } else {
      library = new DartLibrary(fileName);
      this.libraries.set(fileName, library);
    }
    const parts = fullPath.split('.');
    for (let i = parts.length - 1; i >= 0; i--) {
      // Find a unique name by including more of the module hierarchy in the
      // name. This is an arbitrary but hopefully unsurprising scheme to
      // generate unique names. There may be classes or members with conflicting
      // names due to a single d.ts file containing multiple modules.
      const candidateIdentifier = ts.createIdentifier(parts.slice(i).join('_'));
      candidateIdentifier.parent = node;
      const candidateName = fixupIdentifierName(candidateIdentifier);
      if (library.addName(candidateName)) {
        // Able to add name to library.
        let ret = new DartNameRecord(node, candidateName, library);
        this.dartTypes.set(fullPath, ret);
        return ret;
      }
    }

    // Usually the module name prefixes should be sufficient to disambiguate
    // names but sometimes we need to add a numeric prefix as well to
    // disambiguate. We could alternately append the full module prefix as well
    // to make the name choice completely unsurprising albeit even uglier.
    // This case should be very rarely hit.
    for (let i = 2;; i++) {  // must use for-loop because of eslint's no-shadow rule
      let candidateName = parts[parts.length - 1] + i;
      if (library.addName(candidateName)) {
        // Able to add name to library.
        let ret = new DartNameRecord(node, candidateName, library);
        this.dartTypes.set(fullPath, ret);
        return ret;
      }
    }
  }

  lookupName(node: ts.NamedDeclaration, context: ts.Node) {
    let name = this.computeName(node).name;
    return this.fc.resolveImportForSourceFile(node.getSourceFile(), context.getSourceFile(), name);
  }
}

// Methods to make it easier to create new TypeDisplayOptions objects with slightly modified
// versions of existing TypeDisplayOptions objects.

function cloneOptions(options: TypeDisplayOptions): TypeDisplayOptions {
  // typeArguments and resolvedTypeArguments as they are treated as immutable by all code touching
  // them.
  return {
    insideComment: options.insideComment,
    insideTypeArgument: options.insideTypeArgument,
    hideComment: options.hideComment,
    typeArguments: options.typeArguments,
    resolvedTypeArguments: options.resolvedTypeArguments
  };
}

function addInsideTypeArgument(options: TypeDisplayOptions): TypeDisplayOptions {
  let ret = cloneOptions(options);
  ret.insideTypeArgument = true;
  return ret;
}

function addInsideComment(options: TypeDisplayOptions): TypeDisplayOptions {
  let ret = cloneOptions(options);
  ret.insideComment = true;
  return ret;
}

function addHideComment(options: TypeDisplayOptions): TypeDisplayOptions {
  let ret = cloneOptions(options);
  ret.hideComment = true;
  return ret;
}

function setTypeArguments(
    options: TypeDisplayOptions, typeArguments: ts.NodeArray<ts.TypeNode>): TypeDisplayOptions {
  let ret = cloneOptions(options);
  ret.typeArguments = typeArguments;
  return ret;
}

function resolveTypeArguments(
    options: TypeDisplayOptions, parameters: ts.NodeArray<ts.TypeParameterDeclaration>) {
  let ret = cloneOptions(options);
  let typeArguments = options.typeArguments || ts.createNodeArray();
  ret.resolvedTypeArguments = new Map();
  if (parameters) {
    for (let i = 0; i < parameters.length; ++i) {
      let param = parameters[i];
      ret.resolvedTypeArguments.set(base.ident(param.name), typeArguments[i]);
    }
  }
  // Type arguments have been resolved forward so we don't need to emit them directly.
  ret.typeArguments = null;
  return ret;
}

function removeResolvedTypeArguments(options: TypeDisplayOptions): TypeDisplayOptions {
  let ret = cloneOptions(options);
  ret.resolvedTypeArguments = null;
  return ret;
}

export class FacadeConverter extends base.TranspilerBase {
  tc: ts.TypeChecker;
  // For the Dart keyword list see
  // https://dart.dev/guides/language/language-tour#keywords
  static DART_RESERVED_WORDS: Set<string> = new Set(
      ('assert break case catch class const continue default do else enum extends false final ' +
       'finally for if in is new null rethrow return super switch this throw true try let var void ' +
       'while with')
          .split(/ /));

  // These are the built-in identifiers.
  static DART_BUILT_IN_IDENTIFIERS: Set<string> = new Set(
      ('abstract as covariant deferred dynamic export external factory Function get implements import interface' +
       'library mixin operator part set static typedef')
          .split(/ /));

  private candidateTypes: Set<string> = new Set();
  private typingsRootRegex: RegExp;
  private genericMethodDeclDepth = 0;
  private nameRewriter: NameRewriter;
  emitPromisesAsFutures = false;

  constructor(transpiler: Transpiler, typingsRoot?: string, private generateHTML?: boolean) {
    super(transpiler);
    typingsRoot = typingsRoot || '';
    this.nameRewriter = new NameRewriter(this);
    this.extractPropertyNames(TS_TO_DART_TYPENAMES, this.candidateTypes);
    // Remove this line if decide to support generating code that avoids dart:html.
    DART_LIBRARIES_FOR_BROWSER_TYPES.forEach((value, key) => {
      if (this.generateHTML && value === 'dart:html') {
        // We have to delete names of dart:html types that have already been added to candidateTypes
        // by the extractPropertyNames(TS_TO_DART_TYPENAMES, this.candidateTypes) line above
        this.candidateTypes.delete(key);
      } else {
        this.candidateTypes.add(key);
      }
    });

    this.typingsRootRegex = new RegExp('^' + typingsRoot.replace('.', '\\.'));
  }

  private extractPropertyNames(m: Map<string, Map<string, string>>, candidates: Set<string>) {
    for (const fileName of m.keys()) {
      const file = m.get(fileName);
      if (file === undefined) {
        return;
      }
      [...file.keys()]
          .map((propName) => propName.substring(propName.lastIndexOf('.') + 1))
          .forEach((propName) => candidates.add(propName));
    }
  }

  setTypeChecker(tc: ts.TypeChecker) {
    this.tc = tc;
  }

  pushTypeParameterNames(n: ts.FunctionLikeDeclaration) {
    if (!n.typeParameters) return;
    this.genericMethodDeclDepth++;
  }

  popTypeParameterNames(n: ts.FunctionLikeDeclaration) {
    if (!n.typeParameters) return;
    this.genericMethodDeclDepth--;
  }

  resolvePropertyTypes(tn: ts.TypeNode): Map<string, ts.PropertyDeclaration> {
    let res: Map<string, ts.PropertyDeclaration>;
    if (!tn || !this.tc) return res;

    let t = this.tc.getTypeAtLocation(tn);
    for (let sym of this.tc.getPropertiesOfType(t)) {
      let decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]);
      if (decl.kind !== ts.SyntaxKind.PropertyDeclaration &&
          decl.kind !== ts.SyntaxKind.PropertySignature) {
        let msg = this.tc.getFullyQualifiedName(sym) +
            ' used for named parameter definition must be a property';
        this.reportError(decl, msg);
        continue;
      }
      res.set(sym.name, <ts.PropertyDeclaration>decl);
    }
    return res;
  }

  /**
   * The Dart analyzer has a syntax extension that uses comments to emulate
   * generic methods in Dart. We work around this and keep track of which type
   * names in the current scope need to be emitted in comments.
   *
   * TODO(jacobr): Remove this once all Dart implementations support generic
   * methods.
   */
  private isGenericMethodTypeParameterName(name: ts.EntityName): boolean {
    // Avoid checking this unless needed.
    if (this.genericMethodDeclDepth === 0 || !this.tc) return false;
    // Check if the type of the name is a TypeParameter.
    let t = this.tc.getTypeAtLocation(name);
    if (!t || (t.flags & ts.TypeFlags.TypeParameter) === 0) return false;

    // Check if the symbol we're looking at is the type parameter.
    let symbol = this.tc.getSymbolAtLocation(name);
    if (symbol !== t.symbol) return false;

    // Check that the Type Parameter has been declared by a function declaration.
    return symbol.declarations.some(d => d.parent.kind === ts.SyntaxKind.FunctionDeclaration);
  }

  generateTypeList(
      types: ReadonlyArray<ts.TypeNode>, options: TypeDisplayOptions, seperator?: string): string {
    seperator = seperator || ',';
    let that = this;
    if (!types) {
      return '';
    }
    return types
        .map((type) => {
          return that.generateDartTypeName(type, addInsideTypeArgument(options));
        })
        .join(seperator);
  }

  generateDartTypeName(node: ts.TypeNode, options?: TypeDisplayOptions): string {
    if (!options) {
      options = {
        insideComment: this.insideCodeComment,
        insideTypeArgument: this.insideTypeArgument
      };
    }

    let name: string;
    let comment: string;
    if (!node) {
      return 'dynamic';
    }

    if (ts.isTypeQueryNode(node)) {
      name = 'dynamic';
      // TODO(jacobr): evaluate supporting this case.
      // let query = <ts.TypeQueryNode>node;
      // name += '/* TypeQuery: typeof ' + base.ident(query.exprName) + ' */';
    } else if (ts.isTypeOperatorNode(node)) {
      // TODO(derekx): Investigate the possibility of using index signatures to determine whether
      // all keys have the same type, in those cases we can replace 'dynamic' with a real type
      name = 'dynamic';
      comment = `keyof ${this.generateDartTypeName(node.type)}`;
    } else if (ts.isIndexedAccessTypeNode(node)) {
      name = 'dynamic';
      const objectTypeName = this.generateDartTypeName(node.objectType, options);
      const indexTypeName = this.generateDartTypeName(node.indexType, addInsideComment(options));

      comment = `${objectTypeName}[${indexTypeName}]`;
    } else if (ts.isMappedTypeNode(node) || ts.isConditionalTypeNode(node)) {
      name = 'dynamic';
      if (ts.isTypeAliasDeclaration(node.parent)) {
        // Declarations of mapped types and conditional types will be printed in a comment elsewhere
        // in the file. Upon reaching a node of these kinds, we do not want to re-print the
        // declaration. We just want to print the alias name and the type arguments that were
        // passed.
        // MappedTypeNodes and ConditionalTypeNodes don't contain information about the name or type
        // arguments that were passed to the alias, so we have to get that information from the
        // parent.
        const parent = node.parent;
        comment = parent.name.getText();
        if (parent.typeParameters && options.resolvedTypeArguments) {
          comment += '<';
          const resolvedParameters = parent.typeParameters.map(
              param => this.generateDartTypeName(
                  options.resolvedTypeArguments.get(base.ident(param.name)), options));
          for (const resolvedParam of resolvedParameters) {
            comment += resolvedParam;
          }
          comment += '>';
        }
      }
    } else if (ts.isTypePredicateNode(node)) {
      name = 'bool';
      comment = base.ident(node.parameterName) + ' is ' +
          this.generateDartTypeName(node.type, addInsideComment(options));
    } else if (ts.isTupleTypeNode(node)) {
      name = 'List<';
      let mergedType = new MergedType(this);
      node.elementTypes.forEach((t) => mergedType.merge(t));
      name += this.generateDartTypeName(mergedType.toTypeNode(), addInsideTypeArgument(options));
      name += '>';
      // This is intentionally not valid Dart code so that it is clear this isn't a Dart code
      // comment that should use the /*= syntax.
      comment =
          'Tuple of <' + this.generateTypeList(node.elementTypes, addInsideComment(options)) + '>';
    } else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      let merged = new MergedType(this);
      merged.merge(node);
      let simpleType = merged.toSimpleTypeNode();
      if (simpleType) {
        name = this.generateDartTypeName(simpleType, addHideComment(options));
      } else {
        name = 'dynamic';
      }
      let types = node.types;
      comment = this.generateTypeList(
          types, addInsideComment(options), node.kind === ts.SyntaxKind.UnionType ? '|' : '&');
    } else if (ts.isTypePredicateNode(node)) {
      return this.generateDartTypeName(node.type, options);
    } else if (ts.isTypeReferenceNode(node)) {
      // First, check for certain TypeScript utility types and handle them manually as continuing to
      // call generateDartType will try to resolve a type alias that uses the mapped type feature,
      // which doesn't have a Dart equivalent and will become dynamic
      // https://www.typescriptlang.org/docs/handbook/utility-types.html
      const type = node.typeName.getText();
      switch (type) {
        case 'Function':
          // We check this case to prevent generating JS$Function for the name; the keyword
          // Function may be used as a type but not in other cases
          name = 'Function';
          break;
        case 'ReadonlyArray':
          name =
              this.generateDartName(node.typeName, setTypeArguments(options, node.typeArguments));
          comment = 'ReadonlyArray<' +
              this.generateTypeList(node.typeArguments, addInsideComment(options)) + '>';
          break;
        case 'Partial':
          // Partial<X> is currently the same as X since all types are nullable in Dart
          name = this.generateDartTypeName(node.typeArguments[0]);
          comment = node.typeName.getText() + '<' +
              this.generateTypeList(node.typeArguments, addInsideComment(options)) + '>';
          break;
        case 'Record':
          // TODO(derekx): It should be possible to generate a Readonly version of a class by
          // handling it in the same way as other readonly types. That is, emitting another class
          // like JS$ReadonlyX whose members don't have setters.
        default:
          name =
              this.generateDartName(node.typeName, setTypeArguments(options, node.typeArguments));
      }
    } else if (ts.isTypeLiteralNode(node)) {
      let members = node.members;
      if (members.length === 1 && ts.isIndexSignatureDeclaration(members[0])) {
        let indexSig = <ts.IndexSignatureDeclaration>members[0];
        if (indexSig.parameters.length > 1) {
          this.reportError(indexSig, 'Expected an index signature to have a single parameter');
        }
        // Unfortunately for JS interop, we cannot treat JS Objects as Dart
        // Map objects. We could treat them as JSMap<indexSig.type>
        // if we define a base JSMap type that is Map like but not actually
        // a map.
        name = 'dynamic';
        comment = 'JSMap of <' +
            this.generateDartTypeName(indexSig.parameters[0].type, addInsideComment(options)) +
            ',' + this.generateDartTypeName(indexSig.type, addInsideComment(options)) + '>';
      } else {
        name = 'dynamic';
        comment = node.getText();
      }
    } else if (ts.isFunctionTypeNode(node)) {
      // TODO(jacobr): instead of removing the expected type of the this parameter, we could add
      // seperate VoidFuncBindThis and FuncBindThis typedefs to package:func/func.dart if we
      // decide indicating the parameter type of the bound this is useful enough. As JavaScript is
      // moving away from binding this
      let parameters = base.filterThisParameter(node.parameters);
      if (!hasVarArgs(parameters)) {
        name = this.generateDartTypeName(node.type, addInsideTypeArgument(options));
        name += ' Function(';
        let isFirst = true;
        for (let i = 0; i < parameters.length; ++i) {
          if (isFirst) {
            isFirst = false;
          } else {
            name += ', ';
          }
          name += this.generateDartTypeName(parameters[i].type, addInsideTypeArgument(options));
        }
        name += ')';
      } else {
        name = 'Function';
        if (node.getSourceFile()) {
          comment = node.getText();
        }
      }
    } else if (ts.isArrayTypeNode(node)) {
      name = 'List' +
          '<' + this.generateDartTypeName(node.elementType, addInsideTypeArgument(options)) + '>';
    } else if (node.kind === ts.SyntaxKind.NumberKeyword) {
      name = 'num';
    } else if (ts.isLiteralTypeNode(node)) {
      const literal = node.literal;
      if (ts.isLiteralExpression(literal)) {
        comment = `'${literal.text}'`;
        name = 'String';
      } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
        name = 'bool';
        comment = 'true';
      } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
        name = 'bool';
        comment = 'false';
      }
    } else if (ts.isStringLiteral(node) || node.kind === ts.SyntaxKind.StringKeyword) {
      name = 'String';
    } else if (node.kind === ts.SyntaxKind.NullKeyword) {
      name = 'Null';
    } else if (
        node.kind === ts.SyntaxKind.NeverKeyword || node.kind === ts.SyntaxKind.VoidKeyword) {
      name = 'void';
    } else if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
      // TODO(jacobr): I'm not 100% sure whether this should be Null or dynamic.
      name = 'dynamic';
    } else if (node.kind === ts.SyntaxKind.BooleanKeyword) {
      name = 'bool';
    } else if (node.kind === ts.SyntaxKind.AnyKeyword) {
      name = 'dynamic';
    } else if (ts.isParenthesizedTypeNode(node)) {
      return this.generateDartTypeName(node.type, options);
    } else if (ts.isThisTypeNode(node)) {
      return this.generateDartName(base.getEnclosingClass(node).name, options);
    } else {
      this.reportError(node, 'Unexpected TypeNode kind: ' + ts.SyntaxKind[node.kind]);
    }

    if (name == null) {
      this.reportError(node, 'Internal error. Generate null type name.');
      name = 'dynamic';
    }

    name = name.trim();
    return base.formatType(name, comment, options);
  }

  visitTypeName(typeName: ts.EntityName|ts.PropertyName|ts.PropertyAccessExpression) {
    if (ts.isPropertyAccessExpression(typeName)) {
      // The LHS of the expression doesn't matter as we will get the global symbol name for the RHS
      // of the expression.
      this.visitTypeName(typeName.name);
      return;
    }
    if (ts.isQualifiedName(typeName)) {
      // The LHS of the expression doesn't matter as we will get the global symbol name for the RHS
      // of the expression.
      this.visitTypeName(typeName.right);
      return;
    }

    if (!ts.isIdentifier(typeName)) {
      this.visit(typeName);
      return;
    }
    const ident = base.ident(typeName);
    const identifier = typeName;
    if (this.isGenericMethodTypeParameterName(identifier)) {
      // DDC generic methods hack - all names that are type parameters to generic methods have to be
      // emitted in comments.
      this.emitType('dynamic', ident);
      return;
    }

    const custom = this.lookupCustomDartTypeName(
        identifier,
        {insideComment: this.insideCodeComment, insideTypeArgument: this.insideTypeArgument});
    if (custom) {
      if (custom.comment) {
        this.emitType(custom.name, custom.comment);
      } else {
        this.emit(custom.name);
      }
    } else {
      this.visit(typeName);
    }
  }

  getSymbolAtLocation(identifier: ts.EntityName) {
    let symbol = this.tc.getSymbolAtLocation(identifier);
    while (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    return symbol;
  }

  getValueDeclarationOfSymbol(symbol: ts.Symbol, n?: ts.Node): ts.Declaration|undefined {
    if (!symbol || this.tc.isUnknownSymbol(symbol)) {
      return undefined;
    }
    if (!symbol.valueDeclaration) {
      this.reportError(n, `no value declaration for symbol ${symbol.name}`);
      return undefined;
    }
    return symbol.valueDeclaration;
  }

  getTypeDeclarationOfSymbol(symbol: ts.Symbol, n?: ts.Node): ts.Declaration|undefined {
    if (!symbol || this.tc.isUnknownSymbol(symbol)) {
      return undefined;
    }
    const typeDeclaration = symbol.declarations.find((declaration: ts.Declaration) => {
      return ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration) ||
          ts.isTypeAliasDeclaration(declaration) || ts.isTypeParameterDeclaration(declaration) ||
          ts.isEnumDeclaration(declaration);
    });
    if (!typeDeclaration) {
      this.reportError(n, `no type declarations for symbol ${symbol.name}`);
      return undefined;
    }
    return typeDeclaration;
  }

  generateDartName(identifier: ts.EntityName, options: TypeDisplayOptions): string {
    const ret = this.lookupCustomDartTypeName(identifier, options);
    if (ret) {
      return base.formatType(ret.name, ret.comment, options);
    }
    // TODO(jacobr): handle library import prefixes more robustly. This generally works but is
    // fragile.
    return this.maybeAddTypeArguments(base.ident(identifier), options);
  }

  /**
   * Resolves TypeReferences to find the declaration of the referenced type that matches the
   * predicate.
   *
   * For example, if the type passed is a reference to X and the predicate passed is
   * ts.isInterfaceDeclaration, then this function will will return the declaration of interface X,
   * or undefined if there is no such declaration.
   */
  getDeclarationOfReferencedType(
      type: ts.TypeReferenceNode,
      predicate: (declaration: ts.Declaration) => boolean): ts.Declaration {
    const referenceSymbol = this.tc.getTypeAtLocation(type.typeName).getSymbol();
    if (!referenceSymbol) {
      return undefined;
    }
    return referenceSymbol.getDeclarations().find(predicate);
  }

  maybeAddTypeArguments(name: string, options: TypeDisplayOptions): string {
    if (options.typeArguments) {
      name +=
          '<' + this.generateTypeList(options.typeArguments, setTypeArguments(options, null)) + '>';
    }
    return name;
  }

  /**
   * Returns a custom Dart type name or null if the type isn't a custom Dart type.
   */
  lookupCustomDartTypeName(identifier: ts.EntityName, options?: TypeDisplayOptions):
      {name?: string, comment?: string, keep?: boolean} {
    if (!options) {
      options = {
        insideComment: this.insideCodeComment,
        insideTypeArgument: this.insideTypeArgument
      };
    }
    const ident = base.ident(identifier);
    if (ident === 'Promise' && this.emitPromisesAsFutures) {
      return {name: this.maybeAddTypeArguments('Future', options)};
    }
    const symbol: ts.Symbol = this.getSymbolAtLocation(identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.TypeParameter) {
      const parent = this.getTypeDeclarationOfSymbol(symbol).parent;
      if (options.resolvedTypeArguments && options.resolvedTypeArguments.has(ident)) {
        return {
          name: this.generateDartTypeName(
              options.resolvedTypeArguments.get(ident), removeResolvedTypeArguments(options))
        };
      }
      // Only kinds of TypeParameters supported by Dart.
      if (!ts.isClassDeclaration(parent) && !ts.isInterfaceDeclaration(parent) &&
          !ts.isTypeAliasDeclaration(parent)) {
        return {name: 'dynamic', comment: ident};
      }
    }

    if (this.candidateTypes.has(ident)) {
      if (!symbol) {
        return null;
      }

      const fileAndName = this.getLibFileAndName(identifier, symbol);

      if (fileAndName) {
        let fileSubs = TS_TO_DART_TYPENAMES.get(fileAndName.fileName);
        if (fileSubs) {
          const name = fileAndName.qname;
          let dartBrowserType = DART_LIBRARIES_FOR_BROWSER_TYPES.has(name);
          if (fileSubs.has(name)) {
            let subName = fileSubs.get(name);
            if (dartBrowserType) {
              this.addImport(DART_LIBRARIES_FOR_BROWSER_TYPES.get(name), subName);
            }
            return {name: this.maybeAddTypeArguments(subName, options)};
          } else {
            this.addImport(DART_LIBRARIES_FOR_BROWSER_TYPES.get(name), name);
          }
          if (dartBrowserType) {
            // Not a rename but has a dart core libraries definition.
            return {name: this.maybeAddTypeArguments(name, options)};
          }
        }
      }
    }

    const declaration = this.getTypeDeclarationOfSymbol(symbol, identifier);
    if (declaration) {
      if (symbol.flags & ts.SymbolFlags.Enum) {
        // We can't treat JavaScript enums as Dart enums in this case.
        return {name: 'num', comment: 'enum ' + ident};
      }
      let supportedDeclaration = base.supportedTypeDeclaration(declaration);
      if (declaration.kind === ts.SyntaxKind.TypeAliasDeclaration) {
        let alias = <ts.TypeAliasDeclaration>declaration;
        if (supportedDeclaration) {
          return {
            name: this.maybeAddTypeArguments(
                this.nameRewriter.lookupName(declaration, identifier), options),
            keep: true
          };
        }
        // Type alias we cannot support in Dart.
        // Substitute the alias type and parameters directly in the destination.
        return {
          name: this.generateDartTypeName(
              alias.type, resolveTypeArguments(options, alias.typeParameters))
        };
      }

      if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration) ||
          ts.isTypeAliasDeclaration(declaration)) {
        const name = this.nameRewriter.lookupName(declaration, identifier);
        if (ts.isInterfaceDeclaration(declaration) &&
            base.isFunctionTypedefLikeInterface(<ts.InterfaceDeclaration>declaration) &&
            base.getAncestor(identifier, ts.SyntaxKind.HeritageClause)) {
          // TODO(jacobr): we need to specify a specific call method for this
          // case if we want to get the most from Dart type checking.
          return {name: 'Function', comment: name};
        }
        return {name: this.maybeAddTypeArguments(name, options), keep: true};
      }
    }
    return null;
  }

  /**
   * Looks up an identifier that is used as the name of a value (variable or function). Uses the
   * name rewriter to fix naming conflicts.
   *
   * Returns the original name if it doesn't cause any conflicts, otherwise returns a renamed
   * identifier.
   */
  lookupDartValueName(identifier: ts.Identifier, options?: TypeDisplayOptions):
      {name?: string, comment?: string, keep?: boolean} {
    if (!options) {
      options = {
        insideComment: this.insideCodeComment,
        insideTypeArgument: this.insideTypeArgument
      };
    }
    const symbol: ts.Symbol = this.getSymbolAtLocation(identifier);
    const declaration = this.getValueDeclarationOfSymbol(symbol, identifier);
    if (declaration) {
      if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration) ||
          ts.isFunctionDeclaration(declaration)) {
        const name = this.nameRewriter.lookupName(declaration, identifier);
        return {name: this.maybeAddTypeArguments(name, options), keep: true};
      }
    }
  }

  // TODO(jacobr): performance of this method could easily be optimized.
  /**
   * This method works around the lack of Dart support for union types
   * generating a valid Dart type that satisfies all the types passed in.
   */
  toSimpleDartType(types: Array<ts.TypeNode>): ts.TypeNode {
    // We use MergeType to ensure that we have already deduped types that are
    // equivalent even if they aren't obviously identical.
    // MergedType will also follow typed aliases, etc which allows us to avoid
    // including that logic here as well.
    let mergedType = new MergedType(this);
    types.forEach((type) => {
      mergedType.merge(type);
    });
    return mergedType.toSimpleTypeNode();
  }

  findCommonType(type: ts.TypeNode, common: ts.TypeNode): ts.TypeNode {
    if (common === type) return common;

    // If both types generate the exact same Dart type name without comments then there is no need
    // to do anything. The types
    if (this.generateDartTypeName(common, {hideComment: true}) ===
        this.generateDartTypeName(type, {hideComment: true})) {
      return common;
    }

    if (type.kind === ts.SyntaxKind.ArrayType) {
      if (common.kind !== ts.SyntaxKind.ArrayType) {
        return null;
      }
      let array = <ts.ArrayTypeNode>ts.createNode(ts.SyntaxKind.ArrayType);
      array.elementType = this.toSimpleDartType(
          [(common as ts.ArrayTypeNode).elementType, (type as ts.ArrayTypeNode).elementType]);
      return array;
    }
    if (type.kind === ts.SyntaxKind.TypeReference && common.kind === ts.SyntaxKind.TypeReference) {
      let candidate = this.commonSupertype(common, type);
      if (candidate !== null) {
        return candidate;
      }
    }

    if (base.isCallableType(common, this.tc) && base.isCallableType(type, this.tc)) {
      // Fall back to a generic Function type if both types are Function.
      // TODO(jacobr): this is a problematic fallback.
      let fn = <ts.FunctionOrConstructorTypeNode>ts.createNode(ts.SyntaxKind.FunctionType);
      let parameter = <ts.ParameterDeclaration>ts.createNode(ts.SyntaxKind.Parameter);
      parameter.dotDotDotToken = ts.createToken(ts.SyntaxKind.DotDotDotToken);
      let name = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
      name.escapedText = ts.escapeLeadingUnderscores('args');
      fn.parameters = ts.createNodeArray([parameter] as ReadonlyArray<ts.ParameterDeclaration>);
      return fn;
    }
    // No common type found.
    return null;
  }

  toTypeNode(type: ts.Type): ts.TypeNode {
    if (!type) return null;
    let symbol = type.getSymbol();
    if (!symbol) return null;

    let referenceType = <ts.TypeReferenceNode>ts.createNode(ts.SyntaxKind.TypeReference);
    // TODO(jacobr): property need to prefix the name better.
    referenceType.typeName = this.createEntityName(symbol);
    referenceType.typeName.parent = referenceType;
    const decl = this.getTypeDeclarationOfSymbol(symbol);
    base.copyLocation(decl, referenceType);
    return referenceType;
  }

  createEntityName(symbol: ts.Symbol): ts.EntityName {
    let parts = this.tc.getFullyQualifiedName(symbol).split('.');
    let identifier = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
    identifier.escapedText = ts.escapeLeadingUnderscores(parts[parts.length - 1]);
    // TODO(jacobr): do we need to include all parts in the entity name?
    return identifier;
  }

  safeGetBaseTypes(type: ts.InterfaceType): ts.BaseType[] {
    // For an unknown, calling TypeChecker.getBaseTypes on an interface
    // that is a typedef like interface causes the typescript compiler to stack
    // overflow. Not sure if this is a bug in the typescript compiler or I am
    // missing something obvious.
    const declaration = this.getTypeDeclarationOfSymbol(type.symbol) as ts.InterfaceDeclaration;
    if (base.isFunctionTypedefLikeInterface(declaration)) {
      return [];
    }
    return this.tc.getBaseTypes(type);
  }

  // TODO(jacobr): all of these subtype checks are fragile and are likely a
  // mistake. We would be better off handling subtype relationships in Dart
  // where we could reuse an existing Dart type system.
  checkTypeSubtypeOf(source: ts.Type, target: ts.Type) {
    if (source === target) return true;
    if (!(source.flags & ts.ObjectFlags.Interface)) return false;
    let baseTypes = this.safeGetBaseTypes(source as ts.InterfaceType);
    for (let i = 0; i < baseTypes.length; ++i) {
      if (baseTypes[i] === target) return true;
    }
    return false;
  }

  commonSupertype(nodeA: ts.TypeNode, nodeB: ts.TypeNode): ts.TypeNode {
    if (nodeA == null || nodeB == null) return null;
    if (nodeA.kind === ts.SyntaxKind.TypeReference && nodeB.kind === ts.SyntaxKind.TypeReference) {
      // Handle the trivial case where the types are identical except for type arguments.
      // We could do a better job and actually attempt to merge type arguments.
      let refA = nodeA as ts.TypeReferenceNode;
      let refB = nodeB as ts.TypeReferenceNode;
      if (base.ident(refA.typeName) === base.ident(refB.typeName)) {
        let merge = <ts.TypeReferenceNode>ts.createNode(ts.SyntaxKind.TypeReference);
        base.copyLocation(refA, merge);
        merge.typeName = refA.typeName;
        return merge;
      }
    }
    return this.toTypeNode(this.getCommonSupertype(
        this.tc.getTypeAtLocation(nodeA), this.tc.getTypeAtLocation(nodeB)));
  }

  getCommonSupertype(a: ts.Type, b: ts.Type): ts.Type {
    if (a === b) return a;
    // This logic was probably a mistake. It adds a lot of complexity and we can
    // do better performing these calculations in the Dart analyzer based
    // directly on the union types specified in comments.
    return null;
    /*
        if (!(a.flags & ts.TypeFlags.Interface) || !(b.flags & ts.TypeFlags.Interface)) {
          return null;
        }

        let bestCommonSuperType: ts.Type = null;
        let candidatesA = this.safeGetBaseTypes(a as ts.InterfaceType);
        candidatesA.push(a);

        for (let i = 0; i < candidatesA.length; ++i) {
          let type = candidatesA[i];
          if (this.checkTypeSubtypeOf(b, type)) {
            if (!bestCommonSuperType || this.checkTypeSubtypeOf(bestCommonSuperType, type)) {
              bestCommonSuperType = type;
            }
          }
        }
        return bestCommonSuperType;
        */
  }

  private getLibFileAndName(n: ts.Node, originalSymbol: ts.Symbol):
      {fileName: string, qname: string} {
    let symbol = originalSymbol;
    while (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.tc.getAliasedSymbol(symbol);
    }
    const decl = this.getTypeDeclarationOfSymbol(symbol, n);

    const fileName = relative('./node_modules/typescript/lib', decl.getSourceFile().fileName);
    const canonicalFileName = fileName.replace(/(\.d)?\.ts$/, '')
                                  .replace(FACADE_NODE_MODULES_PREFIX, '')
                                  .replace(this.typingsRootRegex, '');

    let qname = this.tc.getFullyQualifiedName(symbol);
    // Some Qualified Names include their file name. Might be a bug in TypeScript,
    // for the time being just special case.
    if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Function | ts.SymbolFlags.Variable)) {
      qname = symbol.getName();
    }

    if (FACADE_DEBUG) {
      console.error('fn:', fileName, 'cfn:', canonicalFileName, 'qn:', qname);
    }
    return {fileName: canonicalFileName, qname};
  }
}
