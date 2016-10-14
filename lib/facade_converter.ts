import * as ts from 'typescript';

import * as base from './base';
import {Set, TypeDisplayOptions} from './base';
import {DART_LIBRARIES_FOR_BROWSER_TYPES, TS_TO_DART_TYPENAMES} from './dart_libraries_for_browser_types';
import {Transpiler} from './main';
import {MergedType} from './merge';

const FACADE_DEBUG = false;
const FACADE_NODE_MODULES_PREFIX = /^(\.\.\/)*node_modules\//;

// These constants must be kept in sync with package:func/func.dart which
// provides a cannonical set of typedefs defining commonly used function types
// to simplify specifying function types in Dart.
const MAX_DART_FUNC_ACTION_PARAMETERS = 4;
const MAX_DART_FUNC_ACTION_PARAMETERS_OPTIONAL = 1;

/**
 * Prefix to add to a variable name that leaves the JS name referenced
 * unchanged.
 */
export const DART_RESERVED_NAME_PREFIX = 'JS$';

/**
 * Fix TypeScript identifier names that are not valid Dart names by adding JS$ to the start of the
 * identifier name.
 */
export function fixupIdentifierName(text: string): string {
  return (FacadeConverter.DART_RESERVED_WORDS.indexOf(text) !== -1 ||
          FacadeConverter.DART_OTHER_KEYWORDS.indexOf(text) !== -1 || text.match(/^(\d|_)/)) ?
      DART_RESERVED_NAME_PREFIX + text :
      text;
}

function numOptionalParameters(parameters: ts.ParameterDeclaration[]): number {
  for (let i = 0; i < parameters.length; ++i) {
    if (parameters[i].questionToken) return parameters.length - i;
  }
  return 0;
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
function fullJsPath(node: base.NamedDeclaration): string {
  let parts: Array<string> = [base.ident(node.name)];
  let p: ts.Node = node.parent;
  while (p != null) {
    let kind = p.kind;
    if (kind === ts.SyntaxKind.ModuleDeclaration || kind === ts.SyntaxKind.InterfaceDeclaration ||
        kind === ts.SyntaxKind.ClassDeclaration) {
      parts.unshift(base.ident((<base.NamedDeclaration>p).name));
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
    this.usedNames = {};
  }

  /**
   * @returns {boolean} whether the name was added.
   */
  addName(name: string): boolean {
    if (Object.prototype.hasOwnProperty.call(this.usedNames, name)) {
      return false;
    }
    this.usedNames[name] = true;
    return true;
  }

  private usedNames: Set;
}

// TODO(jacobr): track name conflicts better and add library prefixes to avoid them.
export class NameRewriter {
  private dartTypes: ts.Map<DartNameRecord> = {};
  // TODO(jacobr): we aren't really using this well.
  private libraries: ts.Map<DartLibrary> = {};

  constructor(private fc: FacadeConverter) {}

  private computeName(node: base.NamedDeclaration): DartNameRecord {
    let fullPath = fullJsPath(node);
    if (Object.prototype.hasOwnProperty.call(this.dartTypes, fullPath)) {
      return this.dartTypes[fullPath];
    }
    let sourceFile = <ts.SourceFile>base.getAncestor(node, ts.SyntaxKind.SourceFile);
    let fileName = sourceFile.fileName;
    let library: DartLibrary;
    if (Object.prototype.hasOwnProperty.call(this.libraries, fileName)) {
      library = this.libraries[fileName];
    } else {
      library = new DartLibrary(fileName);
      this.libraries[fileName] = library;
    }
    let parts = fullPath.split('.');
    for (let i = parts.length - 1; i >= 0; i--) {
      // Find a unique name by including more of the module hierarchy in the
      // name. This is an arbitrary but hopefully unsurprising scheme to
      // generate unique names. There may be classes or members with conflicting
      // names due to a single d.ts file containing multiple modules.
      let candidateName = fixupIdentifierName(parts.slice(i).join('_'));
      if (library.addName(candidateName)) {
        // Able to add name to library.
        let ret = new DartNameRecord(node, candidateName, library);
        this.dartTypes[fullPath] = ret;
        return ret;
      }
    }

    // Usually the module name prefixes should be sufficient to disambiguate
    // names but sometimes we need to add a numeric prefix as well to
    // disambiguate. We could alternately append the full module prefix as well
    // to make the name choice completely unsurprising albeit even uglier.
    // This case should be very rarely hit.
    let i = 2;
    while (true) {
      let candidateName = parts[parts.length - 1] + i;
      if (library.addName(candidateName)) {
        // Able to add name to library.
        let ret = new DartNameRecord(node, candidateName, library);
        this.dartTypes[fullPath] = ret;
        return ret;
      }
      i++;
    }
  }

  lookupName(node: base.NamedDeclaration, context: ts.Node) {
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
    options: TypeDisplayOptions, typeArguments: ts.TypeNode[]): TypeDisplayOptions {
  let ret = cloneOptions(options);
  ret.typeArguments = typeArguments;
  return ret;
}

function resolveTypeArguments(
    options: TypeDisplayOptions, parameters: ts.TypeParameterDeclaration[]) {
  let ret = cloneOptions(options);
  let typeArguments = options.typeArguments ? options.typeArguments : [];
  ret.resolvedTypeArguments = {};
  if (parameters) {
    for (let i = 0; i < parameters.length; ++i) {
      let param = parameters[i];
      ret.resolvedTypeArguments[base.ident(param.name)] = typeArguments[i];
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
  // https://www.dartlang.org/docs/dart-up-and-running/ch02.html#keywords
  static DART_RESERVED_WORDS =
      ('assert break case catch class const continue default do else enum extends false final ' +
       'finally for if in is new null rethrow return super switch this throw true try let void ' +
       'while with')
          .split(/ /);

  // These are the built-in and limited keywords.
  static DART_OTHER_KEYWORDS =
      ('abstract as async await deferred dynamic export external factory get implements import ' +
       'library operator part set static sync typedef yield call')
          .split(/ /);

  private candidateTypes: {[typeName: string]: boolean} = {};
  private typingsRootRegex: RegExp;
  private genericMethodDeclDepth = 0;
  private nameRewriter: NameRewriter;

  constructor(transpiler: Transpiler, typingsRoot = '') {
    super(transpiler);
    this.nameRewriter = new NameRewriter(this);
    this.extractPropertyNames(TS_TO_DART_TYPENAMES, this.candidateTypes);
    // Remove this line if decide to support generating code that avoids dart:html.
    Object.keys(DART_LIBRARIES_FOR_BROWSER_TYPES)
        .forEach((propName) => this.candidateTypes[propName] = true);

    this.typingsRootRegex = new RegExp('^' + typingsRoot.replace('.', '\\.'));
  }

  private extractPropertyNames(m: ts.Map<ts.Map<any>>, candidates: {[k: string]: boolean}) {
    for (let fileName of Object.keys(m)) {
      const file = m[fileName];
      if (file === undefined) {
        return;
      }
      Object.keys(file)
          .map((propName) => propName.substring(propName.lastIndexOf('.') + 1))
          .forEach((propName) => candidates[propName] = true);
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

  resolvePropertyTypes(tn: ts.TypeNode): ts.Map<ts.PropertyDeclaration> {
    let res: ts.Map<ts.PropertyDeclaration> = {};
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
      res[sym.name] = <ts.PropertyDeclaration>decl;
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

  generateTypeList(types: ts.TypeNode[], options: TypeDisplayOptions, seperator = ','): string {
    let that = this;
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

    switch (node.kind) {
      case ts.SyntaxKind.TypeQuery:
        name = 'dynamic';
        // TODO(jacobr): evaluate supporting this case.
        // let query = <ts.TypeQueryNode>node;
        // name += '/* TypeQuery: typeof ' + base.ident(query.exprName) + ' */';
        break;
      case ts.SyntaxKind.TypePredicate:
        return this.generateDartTypeName((node as ts.TypePredicateNode).type, options);
      case ts.SyntaxKind.TupleType:
        let tuple = <ts.TupleTypeNode>node;
        name = 'List<';
        let mergedType = new MergedType(this);
        tuple.elementTypes.forEach((t) => mergedType.merge(t));
        name += this.generateDartTypeName(mergedType.toTypeNode(), addInsideTypeArgument(options));
        name += '>';
        // This is intentionally not valid Dart code so that it is clear this isn't a Dart
        // code comment that should use the /*= syntax.
        comment = 'Tuple of <' +
            this.generateTypeList(tuple.elementTypes, addInsideComment(options)) + '>';
        break;
      case ts.SyntaxKind.UnionType:
      case ts.SyntaxKind.IntersectionType: {
        let typeNode = <ts.UnionOrIntersectionTypeNode>node;
        let merged = new MergedType(this);
        merged.merge(typeNode);
        let simpleType = merged.toSimpleTypeNode();
        if (simpleType) {
          name = this.generateDartTypeName(simpleType, addHideComment(options));
        } else {
          name = 'dynamic';
        }
        let types = typeNode.types;
        comment = this.generateTypeList(
            types, addInsideComment(options), node.kind === ts.SyntaxKind.UnionType ? '|' : '&');
      } break;
      case ts.SyntaxKind.TypePredicate:
        return this.generateDartTypeName((node as ts.TypePredicateNode).type, options);
      case ts.SyntaxKind.TypeReference:
        let typeRef = <ts.TypeReferenceNode>node;
        name = this.generateDartName(
            typeRef.typeName, setTypeArguments(options, typeRef.typeArguments));
        break;
      case ts.SyntaxKind.TypeLiteral:
        let members = (<ts.TypeLiteralNode>node).members;
        if (members.length === 1 && members[0].kind === ts.SyntaxKind.IndexSignature) {
          let indexSig = <ts.IndexSignatureDeclaration>(members[0]);
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
        break;
      case ts.SyntaxKind.FunctionType:
        let callSignature = <ts.FunctionOrConstructorTypeNode>node;
        // TODO(jacobr): instead of removing the expected type of the this parameter, we could add
        // seperate VoidFuncBindThis and FuncBindThis typedefs to package:func/func.dart if we
        // decide indicating the parameter type of the bound this is useful enough. As JavaScript
        // is moving away from binding this
        let parameters = base.filterThisParameter(callSignature.parameters);
        // Use a function signature from package:func where possible.
        let numOptional = numOptionalParameters(parameters);
        let isVoid = callSignature.type && callSignature.type.kind === ts.SyntaxKind.VoidKeyword;
        if (parameters.length <= MAX_DART_FUNC_ACTION_PARAMETERS &&
            numOptional <= MAX_DART_FUNC_ACTION_PARAMETERS_OPTIONAL && !hasVarArgs(parameters)) {
          this.addImport('package:func/func.dart');
          let typeDefName = (isVoid) ? 'VoidFunc' : 'Func';
          typeDefName += parameters.length.toString();
          if (numOptional > 0) {
            typeDefName += 'Opt' + numOptional;
          }
          name = typeDefName;
          let numArgs = parameters.length + (isVoid ? 0 : 1);
          if (numArgs > 0) {
            name += '<';
          }
          let isFirst = true;
          for (let i = 0; i < parameters.length; ++i) {
            if (isFirst) {
              isFirst = false;
            } else {
              name += ', ';
            }
            name += this.generateDartTypeName(parameters[i].type, addInsideTypeArgument(options));
          }
          if (!isVoid) {
            if (!isFirst) {
              name += ', ';
            }
            name += this.generateDartTypeName(callSignature.type, addInsideTypeArgument(options));
          }
          if (numArgs > 0) {
            name += '>';
          }
        } else {
          name = 'Function';
          if (node.getSourceFile()) {
            comment = node.getText();
          }
        }
        break;
      case ts.SyntaxKind.ArrayType:
        name = 'List' +
            '<' +
            this.generateDartTypeName(
                (<ts.ArrayTypeNode>node).elementType, addInsideTypeArgument(options)) +
            '>';
        break;
      case ts.SyntaxKind.NumberKeyword:
        name = 'num';
        break;
      case ts.SyntaxKind.StringLiteralType:
        comment = '\'' + (node as ts.StringLiteralTypeNode).text + '\'';
        name = 'String';
        break;
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.StringKeyword:
        name = 'String';
        break;
      case ts.SyntaxKind.NullKeyword:
        name = 'Null';
        break;
      case ts.SyntaxKind.VoidKeyword:
        // void cannot be used as a type argument in Dart so we fall back to Object if void is
        // unfortunately specified as a type argument.
        // We may need to  update this logic if Dart treatment of void type arguments changes.
        name = options.insideTypeArgument ? 'Null' : 'void';
        break;
      case ts.SyntaxKind.UndefinedKeyword:
        // TODO(jacobr): I'm not 100% sure whether this should be Null or dynamic.
        name = 'dynamic';
        break;
      case ts.SyntaxKind.BooleanKeyword:
        name = 'bool';
        break;
      case ts.SyntaxKind.AnyKeyword:
        name = 'dynamic';
        break;
      case ts.SyntaxKind.ParenthesizedType:
        return this.generateDartTypeName((node as ts.ParenthesizedTypeNode).type, options);
      case ts.SyntaxKind.ThisType:
        return this.generateDartName(base.getEnclosingClass(node).name, options);
      default:
        this.reportError(node, 'Unexpected TypeNode kind: ' + node.kind);
    }
    if (name == null) {
      this.reportError(node, 'Internal error. Generate null type name.');
      name = 'dynamic';
    }

    name = name.trim();
    return base.formatType(name, comment, options);
  }

  visitTypeName(typeName: ts.EntityName|ts.PropertyAccessExpression) {
    if (typeName.kind === ts.SyntaxKind.PropertyAccessExpression) {
      // The LHS of the expression doesn't matter as we will get the global symbol name for the RHS
      // of the expression.
      this.visitTypeName((typeName as ts.PropertyAccessExpression).name);
      return;
    }
    if (typeName.kind === ts.SyntaxKind.QualifiedName) {
      // The LHS of the expression doesn't matter as we will get the global symbol name for the RHS
      // of the expression.
      this.visitTypeName((typeName as ts.QualifiedName).right);
      return;
    }

    if (typeName.kind !== ts.SyntaxKind.Identifier) {
      this.visit(typeName);
      return;
    }
    let ident = base.ident(typeName);
    let identifier = <ts.Identifier>typeName;
    if (this.isGenericMethodTypeParameterName(identifier)) {
      // DDC generic methods hack - all names that are type parameters to generic methods have to be
      // emitted in comments.
      this.emitType('dynamic', ident);
      return;
    }

    let custom = this.lookupCustomDartTypeName(
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

  getSymbolDeclaration(symbol: ts.Symbol, n?: ts.Node): ts.Declaration {
    if (!symbol || this.tc.isUnknownSymbol(symbol)) return null;
    let decl = symbol.valueDeclaration;
    if (!decl) {
      // In the case of a pure declaration with no assignment, there is no value declared.
      // Just grab the first declaration, hoping it is declared once.
      if (!symbol.declarations || symbol.declarations.length === 0) {
        this.reportError(n, 'no declarations for symbol ' + symbol.name);
        return;
      }
      decl = symbol.declarations[0];
    }
    return decl;
  }

  generateDartName(identifier: ts.EntityName, options: TypeDisplayOptions): string {
    let ret = this.lookupCustomDartTypeName(identifier, options);
    if (ret) return base.formatType(ret.name, ret.comment, options);
    // TODO(jacobr): handle library import prefixes more robustly. This generally works
    // but is fragile.
    return this.maybeAddTypeArguments(base.ident(identifier), options);
  }

  /**
   * Returns null if declaration cannot be found or is not valid in Dart.
   */
  getDeclaration(identifier: ts.EntityName): ts.Declaration {
    let symbol: ts.Symbol;

    symbol = this.getSymbolAtLocation(identifier);

    let declaration = this.getSymbolDeclaration(symbol, identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.TypeParameter) {
      let kind = declaration.parent.kind;
      // Only kinds of TypeParameters supported by Dart.
      if (kind !== ts.SyntaxKind.ClassDeclaration && kind !== ts.SyntaxKind.InterfaceDeclaration) {
        return null;
      }
    }
    return declaration;
  }

  maybeAddTypeArguments(name: string, options: TypeDisplayOptions): string {
    if (options.typeArguments) {
      name +=
          '<' + this.generateTypeList(options.typeArguments, setTypeArguments(options, null)) + '>';
    }
    return name;
  }

  /**
   * Returns a custom Dart type name or null if the type isn't a custom Dart
   * type.
   */
  lookupCustomDartTypeName(identifier: ts.EntityName, options?: TypeDisplayOptions):
      {name?: string, comment?: string, keep?: boolean} {
    if (!options) {
      options = {
        insideComment: this.insideCodeComment,
        insideTypeArgument: this.insideTypeArgument
      };
    }
    let ident = base.ident(identifier);
    let symbol: ts.Symbol = this.getSymbolAtLocation(identifier);
    let declaration = this.getSymbolDeclaration(symbol, identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.TypeParameter) {
      let kind = declaration.parent.kind;
      if (options.resolvedTypeArguments &&
          Object.hasOwnProperty.call(options.resolvedTypeArguments, ident)) {
        return {
          name: this.generateDartTypeName(
              options.resolvedTypeArguments[ident], removeResolvedTypeArguments(options))
        };
      }
      // Only kinds of TypeParameters supported by Dart.
      if (kind !== ts.SyntaxKind.ClassDeclaration && kind !== ts.SyntaxKind.InterfaceDeclaration &&
          kind !== ts.SyntaxKind.TypeAliasDeclaration) {
        return {name: 'dynamic', comment: ident};
      }
    }

    if (this.candidateTypes.hasOwnProperty(ident)) {
      if (!symbol) {
        return null;
      }

      let fileAndName = this.getFileAndName(identifier, symbol);

      if (fileAndName) {
        let fileSubs = TS_TO_DART_TYPENAMES[fileAndName.fileName];
        if (fileSubs) {
          let name = fileAndName.qname;
          let dartBrowserType = DART_LIBRARIES_FOR_BROWSER_TYPES.hasOwnProperty(name);
          if (fileSubs.hasOwnProperty(name)) {
            let subName = fileSubs[name];
            if (dartBrowserType) {
              this.addImport(DART_LIBRARIES_FOR_BROWSER_TYPES[name], subName);
            }
            return {name: this.maybeAddTypeArguments(subName, options)};
          } else {
            this.addImport(DART_LIBRARIES_FOR_BROWSER_TYPES[name], name);
          }
          if (dartBrowserType) {
            // Not a rename but has a dart core libraries definition.
            return {name: this.maybeAddTypeArguments(name, options)};
          }
        }
      }
    }
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
                this.nameRewriter.lookupName(<base.NamedDeclaration>declaration, identifier),
                options),
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

      let kind = declaration.kind;
      if (kind === ts.SyntaxKind.ClassDeclaration || kind === ts.SyntaxKind.InterfaceDeclaration ||
          kind === ts.SyntaxKind.VariableDeclaration ||
          kind === ts.SyntaxKind.PropertyDeclaration ||
          kind === ts.SyntaxKind.FunctionDeclaration) {
        let name = this.nameRewriter.lookupName(<base.NamedDeclaration>declaration, identifier);
        if (kind === ts.SyntaxKind.InterfaceDeclaration &&
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

    // If both types generate the exact same Dart type name without comments then
    // there is no need to do anything. The types
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
      fn.parameters = <ts.NodeArray<ts.ParameterDeclaration>>[];
      let parameter = <ts.ParameterDeclaration>ts.createNode(ts.SyntaxKind.Parameter);
      parameter.dotDotDotToken = ts.createNode(ts.SyntaxKind.DotDotDotToken);
      let name = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
      name.text = 'args';
      fn.parameters.push(parameter);
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
    return referenceType;
  }

  createEntityName(symbol: ts.Symbol): ts.EntityName {
    let parts = this.tc.getFullyQualifiedName(symbol).split('.');
    let identifier = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
    identifier.text = parts[parts.length - 1];
    // TODO(jacobr): do we need to include all parts in the entity name?
    return identifier;
  }

  safeGetBaseTypes(type: ts.InterfaceType): ts.ObjectType[] {
    // For an unknown, calling TypeChecker.getBaseTypes on an interface
    // that is a typedef like interface causes the typescript compiler to stack
    // overflow. Not sure if this is a bug in the typescript compiler or I am
    // missing something obvious.
    let declaration = base.getDeclaration(type) as ts.InterfaceDeclaration;
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
    if (!(source.flags & ts.TypeFlags.Interface)) return false;
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

  private getFileAndName(n: ts.Node, originalSymbol: ts.Symbol): {fileName: string, qname: string} {
    let symbol = originalSymbol;
    while (symbol.flags & ts.SymbolFlags.Alias) symbol = this.tc.getAliasedSymbol(symbol);
    let decl = this.getSymbolDeclaration(symbol, n);

    const fileName = decl.getSourceFile().fileName;
    const canonicalFileName = this.getRelativeFileName(fileName)
                                  .replace(/(\.d)?\.ts$/, '')
                                  .replace(FACADE_NODE_MODULES_PREFIX, '')
                                  .replace(this.typingsRootRegex, '');

    let qname = this.tc.getFullyQualifiedName(symbol);
    // Some Qualified Names include their file name. Might be a bug in TypeScript,
    // for the time being just special case.
    if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Function | ts.SymbolFlags.Variable)) {
      qname = symbol.getName();
    }
    if (FACADE_DEBUG) console.error('fn:', fileName, 'cfn:', canonicalFileName, 'qn:', qname);
    return {fileName: canonicalFileName, qname};
  }
}
