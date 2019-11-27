import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter, identifierCanBeRenamed, isValidIdentifier} from './facade_converter';
import {Transpiler} from './main';
import {MergedMember, MergedParameter, MergedType, MergedTypeParameters} from './merge';

const PRIVATE_CLASS_INSTANCE_IN_EXTENSIONS = 'tt';

const enum emitPropertyMode {
  getter,
  setter
}
type emitPropertyOptions = {
  mode: emitPropertyMode,
  declaration: ts.PropertyDeclaration|ts.PropertySignature|ts.VariableDeclaration|
             ts.ParameterDeclaration,
  emitJsAnnotation: boolean,
  isExternal: boolean,
  emitBody?: (declaration: ts.PropertyDeclaration|ts.PropertySignature) => void
};

export function isFunctionLikeProperty(
    decl: ts.VariableDeclaration|ts.ParameterDeclaration|ts.PropertyDeclaration|
    ts.PropertySignature,
    tc: ts.TypeChecker): boolean {
  if (!decl.type) return false;
  // Only properties with simple identifier names are candidates to treat as functions.
  if (!ts.isIdentifier(decl.name)) return false;
  let name = base.ident(decl.name);
  if (name.match(/^on[A-Z]/)) return false;
  return base.isFunctionType(decl.type, tc);
}

export default class DeclarationTranspiler extends base.TranspilerBase {
  private tc: ts.TypeChecker;
  private extendsClass = false;
  private visitPromises = false;
  private containsPromises = false;
  private promiseMembers: ts.SignatureDeclaration[] = [];

  static NUM_FAKE_REST_PARAMETERS = 5;

  setTypeChecker(tc: ts.TypeChecker) {
    this.tc = tc;
  }
  setFacadeConverter(fc: FacadeConverter) {
    this.fc = fc;
  }

  getJsPath(node: ts.Node, suppressUnneededPaths: boolean): string {
    const path: Array<String> = [];
    let moduleDecl =
        base.getAncestor(node, ts.SyntaxKind.ModuleDeclaration) as ts.ModuleDeclaration;
    while (moduleDecl != null) {
      path.unshift(moduleDecl.name.text);
      moduleDecl = base.getAncestor(moduleDecl.parent, ts.SyntaxKind.ModuleDeclaration) as
          ts.ModuleDeclaration;
    }

    let classDecl = base.getEnclosingClass(node);
    if (classDecl) {
      path.push(classDecl.name.text);
    }

    if (ts.isModuleDeclaration(node)) {
      path.push(base.getModuleName(node));
    } else if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      // Already handled by call to getEnclosingClass.
    } else if (ts.isEnumDeclaration(node)) {
      path.push(node.name.text);
    } else if (
        ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node) ||
        ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
        ts.isFunctionDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) || ts.isPropertySignature(node)) {
      let memberName = base.ident(node.name);
      if (!base.isStatic(node) && classDecl != null) return memberName;
      path.push(memberName);
    } else {
      throw 'Internal error. Unexpected node kind:' + ts.SyntaxKind[node.kind];
    }
    if (suppressUnneededPaths && path.length === 1) {
      // No need to specify the path if is simply the node name or the escaped version of the node
      // name.
      return '';
    }
    return path.join('.');
  }

  private isAnonymous(node: ts.Node): boolean {
    if (ts.isInterfaceDeclaration(node)) {
      const extendedInterfaceDecl = node as base.ExtendedInterfaceDeclaration;
      // If we were able to associate a variable declaration with the interface definition then the
      // interface isn't actually anonymous.
      return !extendedInterfaceDecl.constructedType;
    } else if (this.trustJSTypes && ts.isClassLike(node)) {
      // If the trust-js-types flag is set, @anonymous tags are emitted on all classes that don't
      // have any constructors or any static members.
      const hasConstructor = node.members.some((member: ts.TypeElement|ts.ClassElement) => {
        return ts.isConstructorDeclaration(member) || ts.isConstructSignatureDeclaration(member);
      });
      const hasStatic = node.members.some(base.isStatic);
      return !hasConstructor && !hasStatic;
    }
    return false;
  }

  maybeEmitJsAnnotation(node: ts.Node, {suppressUnneededPaths}: {suppressUnneededPaths: boolean}) {
    // No need to emit the annotations as an entity outside the code comment
    // will already have the same annotation.
    if (this.insideCodeComment) return;

    if (this.isAnonymous(node)) {
      this.emit('@anonymous');
      this.emit('@JS()');
      return;
    }
    const name = this.getJsPath(node, suppressUnneededPaths);
    this.emit('@JS(');
    if (name.length > 0) {
      this.emit(`"${name}"`);
    }
    this.emit(')');
  }

  /**
   * Emit fake constructors to placate the Dart Analyzer for JS Interop classes.
   */
  maybeEmitFakeConstructors(decl: ts.Node) {
    if (ts.isClassDeclaration(decl)) {
      // Required to avoid spurious dart errors involving base classes without
      // default constructors.
      this.emit('// @Ignore\n');
      this.fc.visitTypeName(decl.name);
      this.emit('.fakeConstructor$()');
      if (this.extendsClass) {
        // Required to keep the Dart Analyzer happy when a class has subclasses.
        this.emit(': super.fakeConstructor$()');
      }
      this.emit(';\n');
    }
  }

  private visitName(name: ts.PropertyName|ts.BindingName) {
    if (base.getEnclosingClass(name) != null) {
      this.visit(name);
      return;
    }
    // Have to rewrite names in this case as we could have conflicts due to needing to support
    // multiple JS modules in a single Dart module.
    if (!ts.isIdentifier(name)) {
      throw 'Internal error: unexpected function name kind:' + name.kind;
    }
    let entry = this.fc.lookupDartValueName(name);
    if (entry) {
      this.emit(entry.name);
      return;
    }

    this.visit(name);
  }

  private notSimpleBagOfProperties(type: ts.Type): boolean {
    if (this.tc.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return true;
    if (this.tc.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0) return true;
    if (type.symbol) {
      let declaration = type.symbol.declarations.find(ts.isInterfaceDeclaration);
      // We have to check the actual declaration as
      if (declaration && declaration.members) {
        let members = declaration.members;
        for (let i = 0; i < members.length; ++i) {
          let node = members[i];
          if (base.isStatic(node)) return true;
          switch (node.kind) {
            case ts.SyntaxKind.PropertyDeclaration:
            case ts.SyntaxKind.PropertySignature:
            case ts.SyntaxKind.VariableDeclaration:
              break;
            default:
              return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Returns whether all members of the class and all base classes are properties.
   */
  hasOnlyProperties(decl: ts.InterfaceDeclaration, outProperties: ts.PropertyDeclaration[]):
      boolean {
    let type = <ts.InterfaceType>this.tc.getTypeAtLocation(decl);

    let symbols = this.tc.getPropertiesOfType(type);
    let baseTypes = this.tc.getBaseTypes(type);
    if (this.notSimpleBagOfProperties(type)) return false;
    for (let i = 0; i < baseTypes.length; ++i) {
      let baseType = baseTypes[i];
      if (this.notSimpleBagOfProperties(baseType)) return false;
    }

    let properties: ts.Declaration[] = [];

    for (let i = 0; i < symbols.length; ++i) {
      let symbol = symbols[i];
      let property = symbol.valueDeclaration;
      properties.push(property);
    }
    return this.hasOnlyPropertiesHelper(ts.createNodeArray(properties), outProperties);
  }

  hasOnlyPropertiesHelper(
      properties: ts.NodeArray<ts.Declaration>, outProperties: ts.Declaration[]): boolean {
    for (let i = 0; i < properties.length; ++i) {
      let node = properties[i];
      if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) ||
          ts.isVariableDeclaration(node)) {
        if (this.promoteFunctionLikeMembers && isFunctionLikeProperty(node, this.tc)) {
          return false;
        }
        outProperties.push(node);
      } else {
        return false;
      }
    }
    return outProperties.length > 0;
  }

  visitClassBody(decl: base.ClassLike|ts.TypeLiteralNode, name: ts.Identifier) {
    let properties: ts.PropertyDeclaration[] = [];
    let isPropertyBag = false;
    if (ts.isInterfaceDeclaration(decl)) {
      const extendedInterfaceDecl = decl as base.ExtendedInterfaceDeclaration;
      const constructedType = extendedInterfaceDecl.constructedType;
      if (constructedType) {
        // If this interface is the upgraded version of a variable whose type contained a
        // constructor, we must check the type hierarchy of the original type, as well as the
        // properties of the new merged interface.
        if (ts.isInterfaceDeclaration(constructedType)) {
          isPropertyBag = this.hasOnlyProperties(constructedType, properties) &&
              this.hasOnlyPropertiesHelper(decl.members, properties);
        } else if (ts.isTypeLiteralNode(constructedType)) {
          isPropertyBag = this.hasOnlyPropertiesHelper(decl.members, properties);
        }
      } else {
        isPropertyBag = this.hasOnlyProperties(decl, properties);
      }
    } else if (ts.isTypeLiteralNode(decl)) {
      isPropertyBag = this.hasOnlyPropertiesHelper(decl.members, properties);
    }
    this.visitMergingOverloads(decl.members);

    if (isPropertyBag) {
      const propertiesWithValidNames = properties.filter((p) => {
        return isValidIdentifier(p.name);
      });
      this.emit('external factory');
      this.fc.visitTypeName(name);
      if (propertiesWithValidNames.length) {
        this.emitNoSpace('({');
        for (let i = 0; i < propertiesWithValidNames.length; i++) {
          if (i > 0) this.emitNoSpace(',');
          let p = propertiesWithValidNames[i];
          this.visit(p.type);
          this.visit(p.name);
        }
        this.emitNoSpace('});');
      } else {
        this.emitNoSpace('();');
      }
    }
  }

  /**
   * Visits an array of class members and merges overloads.
   *
   * @returns An updated version of the members array. All overloaded methods are grouped into
   *     MergedMember objects that contain all original declarations, as well as the merged result.
   *     Other non-overloaded members are represented by MergedMembers with only one constituent,
   *     which is the single declaration of the member.
   */
  visitMergingOverloads(members: ts.NodeArray<ts.Node>): MergedMember[] {
    const result: MergedMember[] = [];
    // TODO(jacobr): merge method overloads.
    let groups: Map<string, ts.Node[]> = new Map();
    let orderedGroups: Array<ts.Node[]> = [];
    members.forEach((node) => {
      let name = '';
      switch (node.kind) {
        case ts.SyntaxKind.Block:
          // For JS interop we always skip the contents of a block.
          break;
        case ts.SyntaxKind.PropertyDeclaration:
        case ts.SyntaxKind.PropertySignature:
        case ts.SyntaxKind.VariableDeclaration: {
          let propertyDecl = <ts.PropertyDeclaration|ts.VariableDeclaration>node;
          // We need to emit these as properties not fields.
          if (!this.promoteFunctionLikeMembers || !isFunctionLikeProperty(propertyDecl, this.tc)) {
            // Suppress the prototype member
            if (base.ident(propertyDecl.name) === 'prototype') {
              return;
            }
            orderedGroups.push([node]);
            return;
          }
          // Convert to a Method.
          let type = propertyDecl.type;
          let funcDecl = <ts.FunctionLikeDeclaration>ts.createNode(ts.SyntaxKind.MethodDeclaration);
          funcDecl.parent = node.parent;
          funcDecl.name = propertyDecl.name as ts.Identifier;
          switch (type.kind) {
            case ts.SyntaxKind.FunctionType:
              let callSignature = <ts.SignatureDeclaration>(<ts.Node>type);
              funcDecl.parameters = <ts.NodeArray<ts.ParameterDeclaration>>callSignature.parameters;
              funcDecl.type = callSignature.type;
              // Fall through to the function case using this node
              node = funcDecl;
              break;
            case ts.SyntaxKind.UnionType:
            case ts.SyntaxKind.TypeLiteral:
              throw 'Not supported yet';
            default:
              throw 'Unexpected case';
          }
          name = base.ident((<ts.FunctionLikeDeclaration>node).name);
        } break;
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.MethodDeclaration:
        case ts.SyntaxKind.MethodSignature:
        case ts.SyntaxKind.FunctionExpression:
          name = base.ident((<ts.FunctionLikeDeclaration>node).name);
          break;
        case ts.SyntaxKind.CallSignature:
          name = 'call';
          break;
        case ts.SyntaxKind.Constructor:
          break;
        case ts.SyntaxKind.ConstructSignature:
          break;
        case ts.SyntaxKind.IndexSignature:
          name = '[]';
          break;
        default:
          // Create a group with a single entry as merging is not required for this node kind.
          orderedGroups.push([node]);
          return;
      }
      let group: Array<ts.Node>;
      if (groups.has(name)) {
        group = groups.get(name);
      } else {
        group = [];
        groups.set(name, group);
        orderedGroups.push(group);
      }
      group.push(node);
    });

    orderedGroups.forEach((group: Array<ts.SignatureDeclaration>) => {
      const first = group[0];
      // If the members in this group are Promise properties or Promise-returning methods and
      // this.visitPromises is false, skip visiting these members and add them to
      // this.promiseMembers. If the members in this group are/return Promises and
      // this.visitPromises is true, it means that this function is being called from
      // emitMembersAsExtensions and the members should now be visited.
      if (!this.visitPromises && base.isPromise(first.type)) {
        if (!this.containsPromises) {
          this.containsPromises = true;
        }
        group.forEach((declaration: ts.SignatureDeclaration) => {
          this.promiseMembers.push(declaration);
        });
        return;
      }
      if (group.length === 1) {
        this.visit(first);
        result.push(new MergedMember(group, first));
        return;
      }
      group.forEach((fn: ts.Node) => {
        // Emit overrides in a comment that the Dart analyzer can at some point
        // use to improve autocomplete.
        this.maybeLineBreak();
        this.enterCodeComment();
        this.visit(fn);
        this.exitCodeComment();
        this.maybeLineBreak();
      });
      // TODO: actually merge.
      let kind = first.kind;
      let merged = <ts.SignatureDeclaration>ts.createNode(kind);
      merged.parent = first.parent;
      base.copyLocation(first, merged);
      switch (kind) {
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.MethodDeclaration:
        case ts.SyntaxKind.MethodSignature:
        case ts.SyntaxKind.FunctionExpression:
          let fn = <ts.FunctionLikeDeclaration>first;
          merged.name = fn.name;
          break;
        case ts.SyntaxKind.CallSignature:
          break;
        case ts.SyntaxKind.Constructor:
          break;
        case ts.SyntaxKind.ConstructSignature:
          break;
        case ts.SyntaxKind.IndexSignature:
          break;
        default:
          throw 'Unexpected kind:' + kind;
      }
      let mergedParams = first.parameters.map(
          (param: ts.ParameterDeclaration) => new MergedParameter(param, this.fc));
      let mergedType = new MergedType(this.fc);
      mergedType.merge(first.type);

      let mergedTypeParams = new MergedTypeParameters(this.fc);
      mergedTypeParams.merge(first.typeParameters);

      for (let i = 1; i < group.length; ++i) {
        let signature = <ts.SignatureDeclaration>group[i];
        mergedType.merge(signature.type);
        mergedTypeParams.merge(signature.typeParameters);
        let overlap = Math.min(signature.parameters.length, mergedParams.length);
        for (let j = 0; j < overlap; ++j) {
          mergedParams[j].merge(signature.parameters[j]);
        }
        for (let j = overlap; j < mergedParams.length; ++j) {
          mergedParams[j].setOptional();
        }
        for (let j = mergedParams.length; j < signature.parameters.length; ++j) {
          let param = new MergedParameter(signature.parameters[j], this.fc);
          param.setOptional();
          mergedParams.push(param);
        }
      }
      merged.parameters = ts.createNodeArray(mergedParams.map((p) => p.toParameterDeclaration()));
      merged.type = mergedType.toTypeNode();
      merged.typeParameters = mergedTypeParams.toTypeParameters();

      this.fc.visit(merged);
      result.push(new MergedMember(group, merged));
    });
    return result;
  }


  constructor(
      tr: Transpiler, private fc: FacadeConverter, private enforceUnderscoreConventions: boolean,
      private promoteFunctionLikeMembers: boolean, private trustJSTypes: boolean) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.ModuleDeclaration:
        const moduleDecl = <ts.ModuleDeclaration>node;
        const moduleName = base.getModuleName(moduleDecl);
        const moduleBlock = base.getModuleBlock(moduleDecl);
        if (moduleName.startsWith('..')) {
          this.emit(
              '\n// Library augmentation not allowed by Dart. Ignoring augmentation of ' +
              moduleDecl.name.text + '\n');
          break;
        }
        this.emit('\n// Module ' + moduleName + '\n');
        this.visit(moduleBlock);
        this.emit('\n// End module ' + moduleName + '\n');
        break;
      case ts.SyntaxKind.ExportKeyword:
        // TODO(jacobr): perhaps add a specific Dart annotation to indicate
        // exported members or provide a flag to only generate code for exported
        // members.
        break;
      case ts.SyntaxKind.EnumDeclaration: {
        let decl = <ts.EnumDeclaration>node;
        // The only legal modifier for an enum decl is const.
        let isConst = this.hasModifierFlag(decl, ts.ModifierFlags.Const);
        if (isConst) {
          this.reportError(node, 'const enums are not supported');
        }
        // In JS interop mode we have to treat enums as JavaScript classes
        // with static members for each enum constant instead of as first
        // class enums.
        this.maybeEmitJsAnnotation(decl, {suppressUnneededPaths: true});
        this.emit('class');
        this.emit(decl.name.text);
        this.emit('{');
        let nodes = decl.members;
        for (let i = 0; i < nodes.length; i++) {
          this.emit('external static num get');
          this.visit(nodes[i]);
          this.emitNoSpace(';');
        }
        this.emit('}');
      } break;
      case ts.SyntaxKind.Parameter: {
        let paramDecl = <ts.ParameterDeclaration>node;
        if (paramDecl.type && paramDecl.type.kind === ts.SyntaxKind.FunctionType) {
          // Dart uses "returnType paramName ( parameters )" syntax.
          let fnType = <ts.FunctionOrConstructorTypeNode>paramDecl.type;
          let hasRestParameter = fnType.parameters.some(p => !!p.dotDotDotToken);
          if (!hasRestParameter) {
            // Dart does not support rest parameters/varargs, degenerate to just "Function".
            // TODO(jacobr): also consider faking 0 - NUM_FAKE_REST_PARAMETERS
            // instead.
            this.visit(fnType.type);
            this.visit(paramDecl.name);
            this.visitParameters(fnType.parameters, {namesOnly: false});
            break;
          }
        }

        if (paramDecl.dotDotDotToken) {
          // Weak support of varargs that works ok if you have 5 of fewer args.
          let paramType: ts.TypeNode;
          let type = paramDecl.type;
          if (type) {
            if (ts.isArrayTypeNode(type)) {
              paramType = type.elementType;
            } else if (type.kind !== ts.SyntaxKind.AnyKeyword) {
              console.error('Warning: falling back to dynamic for varArgs type: ' + type.getText());
            }
          }

          for (let i = 1; i <= DeclarationTranspiler.NUM_FAKE_REST_PARAMETERS; ++i) {
            if (i > 1) {
              this.emitNoSpace(',');
            }
            this.visit(paramType);
            this.emit(base.ident(paramDecl.name) + i);
          }
          break;
        }
        // TODO(jacobr): should we support
        if (paramDecl.name.kind === ts.SyntaxKind.ObjectBindingPattern) {
          this.emit('Object');
          let pattern = paramDecl.name as ts.ObjectBindingPattern;
          let elements = pattern.elements;
          let name = elements.map((e) => base.ident(e.name)).join('_');
          // Warning: this name is unlikely to but could possible overlap with
          // other parameter names.
          this.emit(name);
          this.enterCodeComment();
          this.emit(pattern.getText());
          this.exitCodeComment();
          break;
        }

        if (paramDecl.name.kind !== ts.SyntaxKind.Identifier) {
          throw 'Unsupported parameter name kind: ' + paramDecl.name.kind;
        }
        this.visit(paramDecl.type);
        this.visit(paramDecl.name);
      } break;
      case ts.SyntaxKind.EnumMember: {
        let member = <ts.EnumMember>node;
        this.visit(member.name);
      } break;
      case ts.SyntaxKind.SourceFile:
        let sourceFile = node as ts.SourceFile;
        this.visitMergingOverloads(sourceFile.statements);
        if (this.containsPromises) {
          this.addImport('package:js/js_util.dart', 'promiseToFuture');
          // TODO(derekx): Move this definition of the Promise class to a package
          this.emit(`@JS()
                     abstract class Promise<T> {
                       external factory Promise(void executor(void resolve(T result), Function reject));
                       external Promise then(void onFulfilled(T result), [Function onRejected]);
                     }\n`);
        }
        break;
      case ts.SyntaxKind.ModuleBlock: {
        let block = <ts.ModuleBlock>node;
        this.visitMergingOverloads(block.statements);
      } break;
      case ts.SyntaxKind.VariableDeclarationList: {
        // We have to handle variable declaration lists differently in the case
        // of JS interop because Dart does not support external variables.
        let varDeclList = <ts.VariableDeclarationList>node;
        this.visitList(varDeclList.declarations, ' ');
      } break;
      case ts.SyntaxKind.VariableDeclaration: {
        // We have to handle variable declarations differently in the case of JS
        // interop because Dart does not support external variables.
        let varDecl = <ts.VariableDeclaration>node;
        this.emitProperty({
          mode: emitPropertyMode.getter,
          declaration: varDecl,
          emitJsAnnotation: true,
          isExternal: true
        });
        if (!this.hasNodeFlag(varDecl, ts.NodeFlags.Const)) {
          this.emitProperty({
            mode: emitPropertyMode.setter,
            declaration: varDecl,
            emitJsAnnotation: true,
            isExternal: true
          });
        }
      } break;
      case ts.SyntaxKind.CallSignature: {
        let fn = <ts.SignatureDeclaration>node;
        this.emit('external');
        this.visit(fn.type);
        this.emit('call');
        this.visitParameters(fn.parameters, {namesOnly: false});
        this.emitNoSpace(';');
      } break;
      case ts.SyntaxKind.IndexSignature:
        this.emit('/* Index signature is not yet supported by JavaScript interop. */\n');
        break;
      case ts.SyntaxKind.ExportAssignment:
        // let exportAssignment = <ts.ExportAssignment>node;
        this.emit('/* WARNING: export assignment not yet supported. */\n');
        break;
      case ts.SyntaxKind.TypeAliasDeclaration: {
        const alias = <ts.TypeAliasDeclaration>node;
        const type = alias.type;
        if (ts.isTypeLiteralNode(type)) {
          // Object literal type alias declarations can be treated like interface declarations.
          const literal = type;
          this.emit('@anonymous\n@JS()\n');
          this.visitClassLikeHelper(
              'abstract class', literal, alias.name, alias.typeParameters, null);
        } else if (ts.isFunctionTypeNode(type)) {
          // Function type alias definitions are equivalent to dart typedefs.
          this.visitFunctionTypedefInterface(base.ident(alias.name), type, alias.typeParameters);
        } else {
          this.enterCodeComment();
          if (ts.isMappedTypeNode(alias.type)) {
            this.emitNoSpace('\n');
            this.emit(
                'Warning: Mapped types are not supported in Dart. Uses of this type will be replaced by dynamic.');
            this.emitNoSpace('\n');
          } else if (ts.isConditionalTypeNode(alias.type)) {
            this.emit(
                'Warning: Conditional types are not supported in Dart. Uses of this type will be replaced by dynamic.');
            this.emitNoSpace('\n');
          }
          this.emitNoSpace(alias.getText());
          this.emitNoSpace('\n');
          this.exitCodeComment();
          this.emitNoSpace('\n');
        }
        // We ignore other type alias declarations as Dart doesn't have a corresponding feature yet.
      } break;
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration: {
        this.extendsClass = false;
        let classDecl = <ts.ClassDeclaration|ts.InterfaceDeclaration>node;
        let isInterface = node.kind === ts.SyntaxKind.InterfaceDeclaration;
        if (isInterface &&
            base.isFunctionTypedefLikeInterface(classDecl as ts.InterfaceDeclaration)) {
          let member = <ts.CallSignatureDeclaration>classDecl.members[0];
          this.visitFunctionTypedefInterface(classDecl.name.text, member, classDecl.typeParameters);
          break;
        }

        let customName = this.fc.lookupCustomDartTypeName(classDecl.name);
        if (customName && !customName.keep) {
          this.emit('\n/* Skipping class ' + base.ident(classDecl.name) + '*/\n');
          break;
        }
        this.maybeEmitJsAnnotation(node, {suppressUnneededPaths: true});

        if (isInterface || this.hasModifierFlag(classDecl, ts.ModifierFlags.Abstract)) {
          this.visitClassLike('abstract class', classDecl);
        } else {
          this.visitClassLike('class', classDecl);
        }
      } break;
      case ts.SyntaxKind.HeritageClause: {
        let heritageClause = <ts.HeritageClause>node;
        if (base.isExtendsClause(<ts.HeritageClause>heritageClause)) {
          this.extendsClass = true;
        }

        if (base.isExtendsClause(heritageClause)) {
          this.emit('extends');
        } else {
          this.emit('implements');
        }
        // Can only have one member for extends clauses.
        this.visitList(heritageClause.types);
      } break;
      case ts.SyntaxKind.ExpressionWithTypeArguments: {
        let exprWithTypeArgs = <ts.ExpressionWithTypeArguments>node;
        let expr = exprWithTypeArgs.expression;
        if (ts.isIdentifier(expr) || ts.isQualifiedName(expr) ||
            ts.isPropertyAccessExpression(expr)) {
          this.fc.visitTypeName(expr);
        } else {
          this.visit(expr);
        }
        this.maybeVisitTypeArguments(exprWithTypeArgs);
      } break;
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature: {
        const ctorDecl = <ts.ConstructorDeclaration>node;
        if (ts.isTypeLiteralNode(node.parent)) {
          // All constructors within TypeLiteralNodes should have been merged into corresponding
          // classes. The only exception is this case, where there exist aliases to those literals.
          this.emit('// Skipping constructor from aliased type.\n');
          this.enterCodeComment();
          this.emit('new');
          this.visitParameters(ctorDecl.parameters, {namesOnly: false});
          this.emitNoSpace(';');
          this.exitCodeComment();
          break;
        }
        // Find containing class name.
        let classDecl = base.getEnclosingClass(ctorDecl);
        if (!classDecl) this.reportError(ctorDecl, 'cannot find outer class node');
        const isAnonymous = this.isAnonymous(classDecl);
        if (isAnonymous) {
          this.emit('// Constructors on anonymous interfaces are not yet supported.\n');
          this.enterCodeComment();
        }
        this.visitDeclarationMetadata(ctorDecl);
        this.fc.visitTypeName(classDecl.name);
        this.visitParameters(ctorDecl.parameters, {namesOnly: false});
        this.emitNoSpace(';');
        if (isAnonymous) {
          this.exitCodeComment();
          this.emit('\n');
        }
      } break;
      case ts.SyntaxKind.PropertyDeclaration:
        this.visitProperty(<ts.PropertyDeclaration>node);
        break;
      case ts.SyntaxKind.SemicolonClassElement:
        // No-op, don't emit useless declarations.
        break;
      case ts.SyntaxKind.MethodDeclaration:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.MethodDeclaration>node);
        break;
      case ts.SyntaxKind.GetAccessor:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'get');
        break;
      case ts.SyntaxKind.SetAccessor:
        this.visitDeclarationMetadata(<ts.MethodDeclaration>node);
        this.visitFunctionLike(<ts.AccessorDeclaration>node, 'set');
        break;
      case ts.SyntaxKind.FunctionDeclaration:
        let funcDecl = <ts.FunctionDeclaration>node;
        this.visitDeclarationMetadata(funcDecl);
        this.visitFunctionLike(funcDecl);
        break;
      case ts.SyntaxKind.FunctionExpression:
        let funcExpr = <ts.FunctionExpression>node;
        this.visitFunctionLike(funcExpr);
        break;
      case ts.SyntaxKind.PropertySignature:
        let propSig = <ts.PropertyDeclaration>node;
        this.visitProperty(propSig);
        break;
      case ts.SyntaxKind.MethodSignature:
        let methodSignatureDecl = <ts.FunctionLikeDeclaration>node;
        this.visitDeclarationMetadata(methodSignatureDecl);
        this.visitFunctionLike(methodSignatureDecl);
        break;
      case ts.SyntaxKind.StaticKeyword:
        // n-op, handled in `visitFunctionLike` and `visitProperty` below.
        break;
      case ts.SyntaxKind.AbstractKeyword:
        // Abstract methods in Dart simply lack implementation,
        // and don't use the 'abstract' modifier
        // Abstract classes are handled in `case ts.SyntaxKind.ClassDeclaration` above.
        break;
      case ts.SyntaxKind.PrivateKeyword:
        // no-op, handled through '_' naming convention in Dart.
        break;
      case ts.SyntaxKind.PublicKeyword:
        // Handled in `visitDeclarationMetadata` below.
        break;
      case ts.SyntaxKind.ProtectedKeyword:
        // Handled in `visitDeclarationMetadata` below.
        break;
      case ts.SyntaxKind.DeclareKeyword:
        // In an ambient top level declaration like "declare var" or "declare function", the declare
        // keyword is stored as a modifier but we don't need to handle it. The JS interop code that
        // needs to be emitted to access these variables or functions is the same regardless of
        // whether they are declared in a .d.ts file or a .ts file.
        // "declare var x" or "export var x" in a .d.ts file is handled the same way as "var x" in a
        // .ts file
        break;
      case ts.SyntaxKind.VariableStatement:
        let variableStmt = <ts.VariableStatement>node;
        this.visit(variableStmt.declarationList);
        break;
      case ts.SyntaxKind.SwitchStatement:
      case ts.SyntaxKind.ArrayLiteralExpression:
      case ts.SyntaxKind.ExpressionStatement:
      case ts.SyntaxKind.EmptyStatement:
        // No need to emit anything for these cases.
        break;
      default:
        return false;
    }
    return true;
  }

  private visitFunctionLike(fn: ts.FunctionLikeDeclaration, accessor?: string) {
    this.fc.pushTypeParameterNames(fn);
    if (base.isStatic(fn)) {
      this.emit('static');
    }

    try {
      this.visit(fn.type);
      if (accessor) this.emit(accessor);
      let name = fn.name;
      if (name) {
        if (name.kind !== ts.SyntaxKind.Identifier) {
          this.reportError(name, 'Unexpected name kind:' + name.kind);
        }
        this.visitName(name);
      }

      if (fn.typeParameters && fn.typeParameters.length > 0) {
        let insideComment = this.insideCodeComment;
        if (!insideComment) {
          this.enterCodeComment();
        }
        this.emitNoSpace('<');
        this.enterTypeArguments();
        this.visitList(fn.typeParameters);
        this.exitTypeArguments();
        this.emitNoSpace('>');
        if (!insideComment) {
          this.exitCodeComment();
        }
      }
      // Dart does not even allow the parens of an empty param list on getter
      if (accessor !== 'get') {
        this.visitParameters(fn.parameters, {namesOnly: false});
      } else {
        if (fn.parameters && fn.parameters.length > 0) {
          this.reportError(fn, 'getter should not accept parameters');
        }
      }
      this.emitNoSpace(';');
    } finally {
      this.fc.popTypeParameterNames(fn);
    }
  }

  /**
   * Visit a property declaration.
   * In the special case of property parameters in a constructor, we also allow
   * a parameter to be emitted as a property.
   * We have to emit properties as getter setter pairs as Dart does not support
   * external fields.
   * In the special case of property parameters in a constructor, we also allow a parameter to be
   * emitted as a property.
   */
  private visitProperty(
      decl: ts.PropertyDeclaration|ts.ParameterDeclaration, isParameter?: boolean) {
    // Check if the name contains special characters other than $ and _
    const canBeRenamed = identifierCanBeRenamed(decl.name);

    // TODO(derekx): Properties with names that contain special characters other than _ and $ are
    // currently ignored by commenting them out. We should determine a way to rename these
    // properties using extension members in the future.
    this.maybeWrapInCodeComment({shouldWrap: !canBeRenamed, newLine: true}, () => {
      this.emitProperty({
        mode: emitPropertyMode.getter,
        declaration: decl,
        emitJsAnnotation: false,
        isExternal: true
      });
    });

    if (!base.isReadonly(decl)) {
      this.maybeWrapInCodeComment({shouldWrap: !canBeRenamed, newLine: true}, () => {
        this.emitProperty({
          mode: emitPropertyMode.setter,
          declaration: decl,
          emitJsAnnotation: false,
          isExternal: true
        });
      });
    }
  }

  private visitClassLike(keyword: string, decl: base.ClassLike) {
    return this.visitClassLikeHelper(
        keyword, decl, decl.name, decl.typeParameters, decl.heritageClauses);
  }

  /**
   * Helper that generates a Dart class definition.
   * The definition of the TypeScript structure we are generating a Dart class facade for is broken
   * down into parts so that we can support all the various ways TypeScript can define a structure
   * that should generate a Dart class.
   */
  private visitClassLikeHelper(
      keyword: string, decl: base.ClassLike|ts.TypeLiteralNode, name: ts.Identifier,
      typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>,
      heritageClauses: ts.NodeArray<ts.HeritageClause>) {
    this.emit(keyword);
    this.visitClassLikeName(name, typeParameters, heritageClauses, false);
    this.emit('{');

    this.maybeEmitFakeConstructors(decl);

    // Synthesize explicit properties for ctor with 'property parameters'
    let synthesizePropertyParam = (param: ts.ParameterDeclaration) => {
      if (this.hasModifierFlag(param, ts.ModifierFlags.Public) ||
          this.hasModifierFlag(param, ts.ModifierFlags.Private) ||
          this.hasModifierFlag(param, ts.ModifierFlags.Protected)) {
        // TODO: we should enforce the underscore prefix on privates
        this.visitProperty(param, true);
      }
    };
    (decl.members as ts.NodeArray<ts.Declaration>)
        .filter(base.isConstructor)
        .forEach(
            (ctor) =>
                (<ts.ConstructorDeclaration>ctor).parameters.forEach(synthesizePropertyParam));

    this.visitClassBody(decl, name);
    this.emit('}\n');
    if (this.promiseMembers.length) {
      const visitName = () => {
        this.visitClassLikeName(name, typeParameters, ts.createNodeArray(), false);
      };
      const visitNameOfExtensions = () => {
        this.visitClassLikeName(name, typeParameters, ts.createNodeArray(), true);
      };
      this.emitMembersAsExtensions(decl, visitName, visitNameOfExtensions, this.promiseMembers);
      this.promiseMembers = [];
    }
    this.emit('\n');
  }

  private visitClassLikeName(
      name: ts.Identifier, typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>,
      heritageClauses: ts.NodeArray<ts.HeritageClause>, extension: boolean) {
    this.fc.visitTypeName(name);

    if (extension) {
      this.emitNoSpace('Extensions');
    }

    if (typeParameters && typeParameters.length > 0) {
      this.emit('<');
      this.enterTypeArguments();
      this.visitList(typeParameters);
      this.exitTypeArguments();
      this.emit('>');
    }

    this.visitEachIfPresent(heritageClauses);
  }

  private visitDeclarationMetadata(decl: ts.Declaration) {
    this.visitEachIfPresent(decl.modifiers);

    switch (decl.kind) {
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature:
        this.emit('external factory');
        break;
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.CallSignature:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.FunctionDeclaration:
        if (!base.getEnclosingClass(decl)) {
          this.maybeEmitJsAnnotation(decl, {suppressUnneededPaths: true});
        }
        this.emit('external');
        break;
      default:
        throw 'Unexpected declaration kind:' + decl.kind;
    }
  }

  /**
   * Handles a function typedef-like interface, i.e. an interface that only declares a single
   * call signature, by translating to a Dart `typedef`.
   */
  private visitFunctionTypedefInterface(
      name: string, signature: ts.SignatureDeclaration,
      typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>) {
    this.emit('typedef');
    if (signature.type) {
      this.visit(signature.type);
    }
    this.emit(name);
    if (typeParameters) {
      this.emitNoSpace('<');
      this.enterTypeArguments();
      this.visitList(typeParameters);
      this.exitTypeArguments();
      this.emitNoSpace('>');
    }
    this.visitParameters(signature.parameters, {namesOnly: false});
    this.emitNoSpace(';');
  }

  private emitProperty({mode, declaration, emitJsAnnotation, isExternal, emitBody}:
                           emitPropertyOptions) {
    const {name, type} = declaration;

    if (emitJsAnnotation) {
      this.maybeEmitJsAnnotation(declaration, {suppressUnneededPaths: true});
    }
    if (isExternal) {
      this.emit('external');
    }
    if (base.isStatic(declaration)) {
      this.emit('static');
    }
    if (mode === emitPropertyMode.getter) {
      this.visit(type);
      this.emit('get');
      this.visitName(name);
    } else if (mode === emitPropertyMode.setter) {
      this.emit('set');
      this.visitName(name);
      this.emitNoSpace('(');
      this.visit(type);
      this.emit('v)');
    }
    if (emitBody && !ts.isVariableDeclaration(declaration) && !ts.isParameter(declaration)) {
      this.emit('{');
      emitBody(declaration);
      this.emit('}');
    } else {
      this.emitNoSpace(';');
    }
  }

  private emitCastThisToPrivateClass(visitClassName: () => void) {
    this.emit('final Object t = this;');
    this.emit('final _');
    visitClassName();
    this.emit('tt = t;\n');
  }

  private emitMembersAsExtensions(
      classDecl: ts.ObjectTypeDeclaration, visitClassName: () => void,
      visitNameOfExtensions: () => void, methods: ts.SignatureDeclaration[]) {
    this.visitPromises = true;
    this.fc.emitPromisesAsFutures = false;
    // Emit private class containing external methods
    this.maybeEmitJsAnnotation(classDecl, {suppressUnneededPaths: false});
    this.emit(`abstract class _`);
    visitClassName();
    this.emit('{');
    const mergedMembers = this.visitMergingOverloads(ts.createNodeArray(Array.from(methods)));
    this.emit('}\n');
    this.fc.emitPromisesAsFutures = true;

    // Emit extensions on public class to expose methods
    this.emit('extension');
    visitNameOfExtensions();
    this.emit('on');
    visitClassName();
    this.emit('{');
    for (const merged of mergedMembers) {
      const declaration = merged.mergedDeclaration;
      if (ts.isPropertyDeclaration(declaration) || ts.isPropertySignature(declaration)) {
        this.emitProperty({
          mode: emitPropertyMode.getter,
          declaration,
          emitJsAnnotation: false,
          isExternal: false,
          emitBody: () => {
            this.emitCastThisToPrivateClass(visitClassName);
            this.emitExtensionGetterBody(declaration);
          }
        });
        if (!base.isReadonly(declaration)) {
          this.emitProperty({
            mode: emitPropertyMode.setter,
            declaration,
            emitJsAnnotation: false,
            isExternal: false,
            emitBody: () => {
              this.emitCastThisToPrivateClass(visitClassName);
              this.emitExtensionSetterBody(declaration);
            }
          });
        }
      } else if (ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration)) {
        this.visit(declaration.type);
        this.visitName(declaration.name);
        this.visitParameters(declaration.parameters, {namesOnly: false});
        this.emit('{');
        this.emitCastThisToPrivateClass(visitClassName);
        this.emitExtensionMethodBody(merged);
        this.emit('}\n');
      }
    }
    this.emit('}\n');
    this.visitPromises = false;
  }

  private emitExtensionMethodBody({constituents, mergedDeclaration}: MergedMember) {
    // Determine all valid arties of this method by going through the overloaded signatures
    const arities: Set<number> = new Set();
    for (const constituent of constituents) {
      const arity = constituent.parameters.length;
      arities.add(arity);
    }
    const sortedArities = Array.from(arities).sort();
    for (const arity of sortedArities) {
      if (arity < mergedDeclaration.parameters.length) {
        const firstOptionalIndex = arity;
        const suppliedParameters = mergedDeclaration.parameters.slice(0, firstOptionalIndex);
        const omittedParameters = mergedDeclaration.parameters.slice(
            firstOptionalIndex, mergedDeclaration.parameters.length);
        // Emit null checks to verify the number of omitted parameters
        this.emit('if (');
        let isFirst = true;
        for (const omitted of omittedParameters) {
          if (isFirst) {
            isFirst = false;
          } else {
            this.emit('&&');
          }
          this.visit(omitted.name);
          this.emit('== null');
        }
        this.emit(') {');
        this.emit('return promiseToFuture(');
        this.emit(PRIVATE_CLASS_INSTANCE_IN_EXTENSIONS);
        this.emit('.');
        this.visitName(mergedDeclaration.name);
        this.visitParameters(ts.createNodeArray(suppliedParameters), {namesOnly: true});
        this.emit('); }\n');
      } else {
        // No parameters were omitted, no null checks are necessary for this call
        this.emit('return promiseToFuture(');
        this.emit(PRIVATE_CLASS_INSTANCE_IN_EXTENSIONS);
        this.emit('.');
        this.visitName(mergedDeclaration.name);
        this.visitParameters(ts.createNodeArray(mergedDeclaration.parameters), {namesOnly: true});
        this.emit(');\n');
      }
    }
  }

  private emitExtensionGetterBody(declaration: ts.PropertyDeclaration|ts.PropertySignature) {
    this.emit('return promiseToFuture(');
    this.emit(PRIVATE_CLASS_INSTANCE_IN_EXTENSIONS);
    this.emit('.');
    this.visitName(declaration.name);
    this.emit(');');
  }

  private emitExtensionSetterBody(declaration: ts.PropertyDeclaration|ts.PropertySignature) {
    this.emit(PRIVATE_CLASS_INSTANCE_IN_EXTENSIONS);
    this.emit('.');
    this.visitName(declaration.name);
    this.emit('=');
    // To emit the call to the Promise constructor, we need to temporarily disable
    // this.fc.emitPromisesAsFutures
    this.fc.emitPromisesAsFutures = false;
    this.visit(declaration.type);
    this.fc.emitPromisesAsFutures = true;
    this.emit('(allowInterop((resolve, reject) { v.then(resolve, onError: reject); }));');
  }
}
