import * as ts from 'typescript';

import * as base from './base';
import {FacadeConverter} from './facade_converter';
import {Transpiler} from './main';
import {MergedParameter, MergedType} from './merge';

export function isFunctionLikeProperty(
    decl: ts.PropertyDeclaration|ts.ParameterDeclaration, tc: ts.TypeChecker): boolean {
  if (!decl.type) return false;
  let name = base.ident(decl.name);
  if (name.match(/^on[A-Z]/)) return false;
  return base.isFunctionType(decl.type, tc);
}

export default class DeclarationTranspiler extends base.TranspilerBase {
  private tc: ts.TypeChecker;

  private moduleStack: string[] = [];
  private extendsClass: boolean = false;

  static NUM_FAKE_REST_PARAMETERS = 5;

  setTypeChecker(tc: ts.TypeChecker) { this.tc = tc; }
  setFacadeConverter(fc: FacadeConverter) { this.fc = fc; }

  getJsPath(node: ts.Node): string {
    let path = [].concat(this.moduleStack);
    let classDecl = base.getEnclosingClass(node);
    if (classDecl) {
      path.push(classDecl.name.text);
    }

    switch (node.kind) {
      case ts.SyntaxKind.ModuleDeclaration:
        break;
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration:
        path.push((<base.ClassLike>node).name.text);
        break;
      case ts.SyntaxKind.EnumDeclaration:
        path.push((<ts.EnumDeclaration>node).name.text);
        break;
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.VariableDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.PropertySignature:
        let memberName = base.ident((<base.NamedDeclaration>node).name);
        if (!base.isStatic(node) && classDecl != null) return memberName;
        path.push(memberName);
        break;
      default:
        throw 'Internal error. Unexpected node kind:' + node.kind;
    }
    if (path.length === 1) {
      // No need to specify the path if is simply the node name.
      return '';
    }
    return path.join('.');
  }

  private isAnonymousInterface(node: ts.Node): boolean {
    if (node.kind !== ts.SyntaxKind.InterfaceDeclaration) return false;
    // This is a bit of a hack but for the purposes of Dart codegen,
    // interfaces with static members or constructors have a known class name
    // at least for the purposes of resolving static members.
    // Example case that triggers this case:
    // interface Foo {
    //   bar();
    // }
    // declare let Foo: {
    //   new(): Foo,
    //   SOME_STATIC : number;
    // }
    return (<ts.InterfaceDeclaration>node).members.every((m: ts.Declaration) => {
      return m.kind !== ts.SyntaxKind.Constructor && !base.isStatic(m);
    });
  }

  maybeEmitJsAnnotation(node: ts.Node) {
    // No need to emit the annotations as an entity outside the code comment
    // will already have the same annotation.
    if (this.insideCodeComment) return;

    if (this.isAnonymousInterface(node)) {
      this.emit('@anonymous');
      this.emit('@JS()');
      return;
    }
    let name: String = this.getJsPath(node);
    this.emit('@JS(');
    if (name.length > 0) {
      this.emit('"' + name + '"');
    }
    this.emit(')');
  }

  /**
   * Emit fake constructors to placate the Dart Analyzer for JS Interop classes.
   */
  maybeEmitFakeConstructors(decl: base.ClassLike) {
    if (decl.kind === ts.SyntaxKind.ClassDeclaration) {
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

  private visitName(name: ts.Node) {
    if (base.getEnclosingClass(name) != null) {
      this.visit(name);
      return;
    }
    // Have to rewrite names in this case as we could have conflicts
    // due to needing to support multiple JS modules in a single JS module
    if (name.kind !== ts.SyntaxKind.Identifier) {
      throw 'Internal error: unexpected function name kind:' + name.kind;
    }
    let entry = this.fc.lookupCustomDartTypeName(<ts.Identifier>name, this.insideCodeComment);
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
      let declaration = <ts.InterfaceDeclaration>type.symbol.declarations[0];
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
   * Returns whether all members of the class and all base classes
   */
  hasOnlyProperties(decl: ts.InterfaceDeclaration, outProperties: ts.PropertyDeclaration[]):
      boolean {
    let type = <ts.InterfaceType>this.tc.getTypeAtLocation(decl);

    let properties = this.tc.getPropertiesOfType(type);
    let baseTypes = this.tc.getBaseTypes(type);
    if (this.notSimpleBagOfProperties(type)) return false;
    for (let i = 0; i < baseTypes.length; ++i) {
      let baseType = baseTypes[i];
      if (this.notSimpleBagOfProperties(baseType)) return false;
    }

    for (let i = 0; i < properties.length; ++i) {
      let symbol = properties[i];
      let node = symbol.valueDeclaration;
      switch (node.kind) {
        case ts.SyntaxKind.PropertyDeclaration:
        case ts.SyntaxKind.PropertySignature:
        case ts.SyntaxKind.VariableDeclaration:
          let prop = <ts.PropertyDeclaration>node;
          if (this.promoteFunctionLikeMembers && isFunctionLikeProperty(prop, this.tc)) {
            return false;
          }
          outProperties.push(prop);
          break;
        default:
          return false;
      }
    }
    return outProperties.length > 0;
  }

  visitClassBody(decl: base.ClassLike) {
    let properties: ts.PropertyDeclaration[] = [];
    let isPropertyBag = decl.kind === ts.SyntaxKind.InterfaceDeclaration &&
        this.hasOnlyProperties(<ts.InterfaceDeclaration>decl, properties);
    this.visitMergingOverloads(decl.members);

    if (isPropertyBag) {
      this.emit('external factory');
      this.fc.visitTypeName(decl.name);
      this.emitNoSpace('({');
      for (let i = 0; i < properties.length; i++) {
        if (i > 0) this.emitNoSpace(',');
        let p = properties[i];
        this.visit(p.type);
        this.visit(p.name);
      }
      this.emitNoSpace('});');
    }
  }

  visitMergingOverloads(members: Array<ts.Node>) {
    // TODO(jacobr): merge method overloads.
    let groups: {[name: string]: Array<ts.Node>} = {};
    let orderedGroups: Array<Array<ts.Node>> = [];
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
        case ts.SyntaxKind.ClassDeclaration:
        case ts.SyntaxKind.InterfaceDeclaration:
        case ts.SyntaxKind.VariableStatement:
          orderedGroups.push([node]);
          return;
        case ts.SyntaxKind.GetAccessor:
        case ts.SyntaxKind.SetAccessor:
        case ts.SyntaxKind.SemicolonClassElement:
        case ts.SyntaxKind.ModuleDeclaration:
        case ts.SyntaxKind.TypeAliasDeclaration:
        case ts.SyntaxKind.ExportAssignment:
          orderedGroups.push([node]);
          return;
        default:
          console.log('Warning: unexpected type... overloads: ' + node.kind + ' ' + node.getText());
          orderedGroups.push([node]);
          return;
      }
      let group: Array<ts.Node>;
      if (Object.prototype.hasOwnProperty.call(groups, name)) {
        group = groups[name];
      } else {
        group = [];
        groups[name] = group;
        orderedGroups.push(group);
      }
      group.push(node);
    });

    orderedGroups.forEach((group: Array<ts.Node>) => {
      if (group.length === 1) {
        this.visit(group[0]);
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
      let first = <ts.SignatureDeclaration>group[0];
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

      for (let i = 1; i < group.length; ++i) {
        let signature = <ts.SignatureDeclaration>group[i];
        mergedType.merge(signature.type);
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
      merged.parameters = <ts.NodeArray<ts.ParameterDeclaration>>mergedParams.map(
          (p) => p.toParameterDeclaration());
      merged.type = mergedType.toTypeNode();

      this.fc.visit(merged);
    });
  }


  constructor(
      tr: Transpiler, private fc: FacadeConverter, private enforceUnderscoreConventions: boolean,
      private promoteFunctionLikeMembers: boolean) {
    super(tr);
  }

  visitNode(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.ModuleDeclaration:
        let moduleDecl = <ts.ModuleDeclaration>node;
        this.emit('\n// Module ' + moduleDecl.name.text + '\n');
        this.moduleStack.push(moduleDecl.name.text);

        this.visit(moduleDecl.body);
        this.emit('\n// End module ' + moduleDecl.name.text + '\n');
        this.moduleStack.pop();
        break;
      case ts.SyntaxKind.ExportKeyword:
        // TODO(jacobr): perhaps add a specific Dart annotation to indicate
        // exported members or provide a flag to only generate code for exported
        // members.
        break;
      case ts.SyntaxKind.EnumDeclaration: {
        let decl = <ts.EnumDeclaration>node;
        // The only legal modifier for an enum decl is const.
        let isConst = decl.modifiers && (decl.modifiers.flags & ts.NodeFlags.Const);
        if (isConst) {
          this.reportError(node, 'const enums are not supported');
        }
        // In JS interop mode we have to treat enums as JavaScript classes
        // with static members for each enum constant instead of as first
        // class enums.
        this.maybeEmitJsAnnotation(decl);
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
            this.visitParameters(fnType.parameters);
            break;
          }
        }

        if (paramDecl.dotDotDotToken) {
          // Weak support of varargs that works ok if you have 5 of fewer args.
          let paramType: ts.TypeNode;
          let type = paramDecl.type;
          if (type) {
            if (type.kind === ts.SyntaxKind.ArrayType) {
              let arrayType = <ts.ArrayTypeNode>type;
              paramType = arrayType.elementType;
            } else if (type.kind !== ts.SyntaxKind.AnyKeyword) {
              throw 'Unexpected type for varargs: ' + type.kind;
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
          let pattern = paramDecl.name as ts.BindingPattern;
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
      case ts.SyntaxKind.ModuleBlock: {
        let block = <ts.ModuleBlock>node;
        this.visitMergingOverloads(block.statements);
      } break;
      case ts.SyntaxKind.VariableDeclarationList: {
        // We have to handle variable declaration lists differently in the case
        // of JS interop because Dart does not support external variables.
        let varDeclList = <ts.VariableDeclarationList>node;
        this.visitList(varDeclList.declarations, ';');
      } break;
      case ts.SyntaxKind.VariableDeclaration: {
        // We have to handle variable declarations differently in the case of JS
        // interop because Dart does not support external variables.
        let varDecl = <ts.VariableDeclaration>node;
        this.maybeEmitJsAnnotation(varDecl);
        this.emit('external');
        this.visit(varDecl.type);
        this.emit('get');
        this.visitName(varDecl.name);
        if (!this.hasFlag(varDecl.parent, ts.NodeFlags.Const)) {
          this.emitNoSpace(';');
          this.maybeEmitJsAnnotation(varDecl);
          this.emit('external');
          this.emit('set');
          this.visitName(varDecl.name);
          this.emitNoSpace('(');
          this.visit(varDecl.type);
          this.emit('v)');
        }
      } break;
      case ts.SyntaxKind.StringLiteral: {
        this.emit('String');
        this.enterCodeComment();
        let sLit = <ts.LiteralExpression>node;
        let text = JSON.stringify(sLit.text);
        this.emit(text);
        this.exitCodeComment();
      } break;
      case ts.SyntaxKind.CallSignature: {
        let fn = <ts.SignatureDeclaration>node;
        this.emit('external');
        this.visit(fn.type);
        this.emit('call');
        this.visitParameters(fn.parameters);
        this.emitNoSpace(';');
      } break;
      case ts.SyntaxKind.IndexSignature:
        this.emit('/* Index signature is not yet supported by JavaScript interop. */\n');
        break;
      case ts.SyntaxKind.ExportAssignment:
        // let exportAssignment = <ts.ExportAssignment>node;
        this.emit('/* WARNING: export assignment not yet supported. */\n');
        break;
      case ts.SyntaxKind.TypeAliasDeclaration:
        // Dart does not provide special syntax for definning type alais
        // declarations so we do not emit anything here and resolve alaises
        // to their original types at each usage site.
        break;
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

        let customName = this.fc.lookupCustomDartTypeName(classDecl.name, this.insideCodeComment);
        if (customName && !customName.keep) {
          this.emit('\n/* Skipping class ' + base.ident(classDecl.name) + '*/\n');
          break;
        }
        this.maybeEmitJsAnnotation(node);

        if (isInterface ||
            (classDecl.modifiers && (classDecl.modifiers.flags & ts.NodeFlags.Abstract))) {
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
        this.visit(exprWithTypeArgs.expression);
        this.maybeVisitTypeArguments(exprWithTypeArgs);
      } break;
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.ConstructSignature: {
        let ctorDecl = <ts.ConstructorDeclaration>node;
        // Find containing class name.
        let classDecl = base.getEnclosingClass(ctorDecl);
        if (!classDecl) this.reportError(ctorDecl, 'cannot find outer class node');
        this.visitDeclarationMetadata(ctorDecl);
        this.fc.visitTypeName(classDecl.name);
        this.visitParameters(ctorDecl.parameters);
        this.emitNoSpace(';');
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
      case ts.SyntaxKind.VariableStatement:
        let variableStmt = <ts.VariableStatement>node;
        this.visit(variableStmt.declarationList);
        this.emitNoSpace(';');
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
        this.fc.visitTypeName(<ts.Identifier>name);
      }

      if (fn.typeParameters) {
        let insideComment = this.insideCodeComment;
        if (!insideComment) {
          this.enterCodeComment();
        }
        this.emitNoSpace('<');
        // Emit the names literally instead of visiting, otherwise they will be replaced with the
        // comment hack themselves.
        // TODO(jacobr): we can use the regular type parameter visiting pattern
        // now that we properly track whether we are inside a comment.
        this.emitNoSpace(fn.typeParameters.map(p => base.ident(p.name)).join(', '));
        this.emitNoSpace('>');
        if (!insideComment) {
          this.exitCodeComment();
        }
      }
      // Dart does not even allow the parens of an empty param list on getter
      if (accessor !== 'get') {
        this.visitParameters(fn.parameters);
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
  private visitProperty(decl: ts.PropertyDeclaration|ts.ParameterDeclaration, isParameter = false) {
    let isStatic = base.isStatic(decl);
    this.emit('external');
    if (isStatic) this.emit('static');
    this.visit(decl.type);
    this.emit('get');
    this.visitName(decl.name);
    this.emitNoSpace(';');

    this.emit('external');
    if (isStatic) this.emit('static');
    this.emit('set');
    this.visitName(decl.name);
    this.emitNoSpace('(');
    this.visit(decl.type);
    this.emit('v');
    this.emitNoSpace(')');
    this.emitNoSpace(';');
  }

  private visitClassLike(keyword: string, decl: base.ClassLike) {
    this.emit(keyword);
    this.fc.visitTypeName(decl.name);
    if (decl.typeParameters) {
      this.emit('<');
      this.visitList(decl.typeParameters);
      this.emit('>');
    }

    this.visitEachIfPresent(decl.heritageClauses);
    this.emit('{');

    this.maybeEmitFakeConstructors(decl);

    // Synthesize explicit properties for ctor with 'property parameters'
    let synthesizePropertyParam = (param: ts.ParameterDeclaration) => {
      if (this.hasFlag(param.modifiers, ts.NodeFlags.Public) ||
          this.hasFlag(param.modifiers, ts.NodeFlags.Private) ||
          this.hasFlag(param.modifiers, ts.NodeFlags.Protected)) {
        // TODO: we should enforce the underscore prefix on privates
        this.visitProperty(param, true);
      }
    };
    (decl.members as ts.NodeArray<ts.Declaration>)
        .filter(base.isConstructor)
        .forEach(
            (ctor) =>
                (<ts.ConstructorDeclaration>ctor).parameters.forEach(synthesizePropertyParam));

    this.visitClassBody(decl);
    this.emit('}');
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
          this.maybeEmitJsAnnotation(decl);
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
      name: string, signature: ts.CallSignatureDeclaration,
      typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>) {
    this.emit('typedef');
    if (signature.type) {
      this.visit(signature.type);
    }
    this.emit(name);
    if (typeParameters) {
      this.emitNoSpace('<');
      this.visitList(typeParameters);
      this.emitNoSpace('>');
    }
    this.visitParameters(signature.parameters);
    this.emitNoSpace(';');
  }
}
