import ts = require('typescript');
import base = require('./base');
import {FacadeConverter} from './facade_converter';

/**
 * To support arbitrary d.ts files in Dart we often have to merge two TypeScript
 * types into a single Dart type because Dart lacks features such as method
 * overloads, type aliases, and union types.
 */
export class MergedType {
  constructor(private fc: FacadeConverter) {}

  merge(t?: ts.TypeNode) {
    if (t) {
      // TODO(jacobr): get a better unique name for a type.
      switch (t.kind) {
        case ts.SyntaxKind.UnionType:
          let union = <ts.UnionTypeNode>t;
          union.types.forEach(this.merge.bind(this));
          return;
        case ts.SyntaxKind.LastTypeNode:
          this.merge((t as ts.ParenthesizedTypeNode).type);
          return;
        case ts.SyntaxKind.TypePredicate:
          this.merge((t as ts.TypePredicateNode).type);
          return;
        case ts.SyntaxKind.TypeReference:
          // We need to follow Alais types as Dart does not support them for non
          // function types. TODO(jacobr): handle them for Function types?
          let typeRef = <ts.TypeReferenceNode>t;
          let decl = this.fc.getDeclaration(typeRef.typeName);
          if (decl !== null && decl.kind === ts.SyntaxKind.TypeAliasDeclaration) {
            let alias = <ts.TypeAliasDeclaration>decl;

            if (typeRef.typeArguments) {
              throw 'TypeReference with arguements not supported yet:' + t.getText();
            }

            this.merge(alias.type);
            return;
          }
          break;
        default:
          break;
      }
      this.types[this.fc.generateDartTypeName(t, true)] = t;
    }
  }

  toTypeNode(): ts.TypeNode {
    let names = Object.getOwnPropertyNames(this.types);
    if (names.length === 0) {
      return null;
    }
    if (names.length === 1) {
      return this.types[names[0]];
    }
    let union = <ts.UnionTypeNode>ts.createNode(ts.SyntaxKind.UnionType);
    base.copyLocation(this.types[names[0]], union);

    union.types = <ts.NodeArray<ts.TypeNode>>[];
    for (let i = 0; i < names.length; ++i) {
      union.types.push(this.types[names[i]]);
    }
    return union;
  }

  private types: {[name: string]: ts.TypeNode} = {};
}

/**
 * Handle a parameter that is the result of merging parameter declarations from
 * multiple method overloads.
 */
export class MergedParameter {
  constructor(param: ts.ParameterDeclaration, fc: FacadeConverter) {
    this.type = new MergedType(fc);
    this.textRange = param;
    this.merge(param);
  }

  merge(param: ts.ParameterDeclaration) {
    this.name[base.ident(param.name)] = true;
    if (!this.optional) {
      this.optional = !!param.questionToken;
    }
    this.type.merge(param.type);
  }

  toParameterDeclaration(): ts.ParameterDeclaration {
    let ret = <ts.ParameterDeclaration>ts.createNode(ts.SyntaxKind.Parameter);
    let nameIdentifier = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
    nameIdentifier.text = Object.getOwnPropertyNames(this.name).join('_');
    ret.name = nameIdentifier;
    if (this.optional) {
      ret.questionToken = ts.createNode(ts.SyntaxKind.QuestionToken);
    }
    base.copyLocation(this.textRange, ret);
    ret.type = this.type.toTypeNode();
    return ret;
  }

  setOptional() { this.optional = true; }

  private name: {[s: string]: boolean} = {};
  private type: MergedType;
  private optional: boolean = false;
  private textRange: ts.TextRange;
}

/**
 * Normalize a SourceFile
 */
export function normalizeSourceFile(f: ts.SourceFile) {
  let modules: {[name: string]: ts.ModuleDeclaration} = {};

  // Merge top level modules.
  for (let i = 0; i < f.statements.length; ++i) {
    let statement = f.statements[i];
    if (statement.kind !== ts.SyntaxKind.ModuleDeclaration) continue;
    let moduleDecl = <ts.ModuleDeclaration>statement;
    let name = moduleDecl.name.text;
    if (modules.hasOwnProperty(name)) {
      let srcBody = modules[name].body;
      let srcBodyBlock: ts.ModuleBlock;

      if (srcBody.kind !== ts.SyntaxKind.ModuleBlock) {
        throw 'Module body must be a module block.';
      }
      srcBodyBlock = <ts.ModuleBlock>srcBody;

      let body = moduleDecl.body;
      if (body.kind === ts.SyntaxKind.ModuleBlock) {
        let bodyBlock = <ts.ModuleBlock>body;
        Array.prototype.push.apply(srcBodyBlock.statements, bodyBlock.statements);
      } else {
        // moduleDecl.body is a ModuleDeclaration.
        srcBodyBlock.statements.push(moduleDecl.body);
      }

      f.statements.splice(i, 1);
      i--;
    } else {
      modules[name] = moduleDecl;
    }
  }

  function addModifier(n: ts.Node, modifier: ts.Node) {
    if (!n.modifiers) {
      n.modifiers = <ts.ModifiersArray>[];
      n.modifiers.flags = 0;
    }
    modifier.parent = n;
    n.modifiers.push(modifier);
  }

  function mergeVariablesIntoClasses(n: ts.Node, classes: {[name: string]: base.ClassLike}) {
    switch (n.kind) {
      case ts.SyntaxKind.VariableStatement:
        let statement = <ts.VariableStatement>n;
        statement.declarationList.declarations.forEach(function(
            declaration: ts.VariableDeclaration) {
          if (declaration.name.kind === ts.SyntaxKind.Identifier) {
            let name: string = (<ts.Identifier>(declaration.name)).text;
            if (classes.hasOwnProperty(name)) {
              let existing = classes[name];
              let members = existing.members as Array<ts.ClassElement>;
              if (declaration.type) {
                let type: ts.TypeNode = declaration.type;
                if (type.kind === ts.SyntaxKind.TypeLiteral) {
                  removeNode(n);
                  let literal = <ts.TypeLiteralNode>type;
                  literal.members.forEach((member: ts.Node) => {
                    switch (member.kind) {
                      case ts.SyntaxKind.ConstructSignature:
                        let signature: any = member;
                        let constructor =
                            <ts.ConstructorDeclaration>ts.createNode(ts.SyntaxKind.Constructor);
                        constructor.parameters = signature.parameters;
                        constructor.type = signature.type;
                        base.copyLocation(signature, constructor);
                        constructor.typeParameters = signature.typeParameters;
                        constructor.parent = existing;
                        members.push(<ts.ClassElement>constructor);
                        break;
                      case ts.SyntaxKind.Constructor:
                        member.parent = existing.parent;
                        members.push(<ts.ClassElement>member);
                        break;
                      case ts.SyntaxKind.MethodSignature:
                        member.parent = existing.parent;
                        members.push(<ts.ClassElement>member);
                        break;
                      case ts.SyntaxKind.PropertySignature:
                        addModifier(member, ts.createNode(ts.SyntaxKind.StaticKeyword));
                        member.parent = existing;
                        members.push(<ts.ClassElement>member);
                        break;
                      case ts.SyntaxKind.IndexSignature:
                        member.parent = existing.parent;
                        members.push(<ts.ClassElement>member);
                        break;
                      case ts.SyntaxKind.CallSignature:
                        member.parent = existing.parent;
                        members.push(<ts.ClassElement>member);
                        break;
                      default:
                        throw 'Unhandled TypeLiteral member type:' + member.kind;
                    }
                  });
                }
              }
            }
          } else {
            throw 'Unexpected VariableStatement identifier kind';
          }
        });
        break;
      case ts.SyntaxKind.ModuleBlock:
        ts.forEachChild(n, (child) => mergeVariablesIntoClasses(child, classes));
        break;
      default:
        break;
    }
  }

  function removeFromArray(nodes: ts.NodeArray<ts.Node>, v: ts.Node) {
    for (let i = 0, len = nodes.length; i < len; ++i) {
      if (nodes[i] === v) {
        nodes.splice(i, 1);
        break;
      }
    }
  }

  function removeNode(n: ts.Node) {
    let parent = n.parent;
    switch (parent.kind) {
      case ts.SyntaxKind.ModuleBlock:
        let block = <ts.ModuleBlock>parent;
        removeFromArray(block.statements, n);
        break;
      case ts.SyntaxKind.SourceFile:
        let sourceFile = <ts.SourceFile>parent;
        removeFromArray(sourceFile.statements, n);
        break;
      default:
        throw 'removeNode not implemented for kind:' + parent.kind;
    }
  }

  function makeCallableClassesImplementFunction(decl: base.ClassLike) {
    if (base.isCallable(decl)) {
      // Modify the AST to explicitly state that the class implements Function
      if (!decl.heritageClauses) {
        decl.heritageClauses = <ts.NodeArray<ts.HeritageClause>>[];
        base.copyLocation(decl, decl.heritageClauses);
      }
      let clauses = decl.heritageClauses;
      let clause = base.arrayFindPolyfill(
          clauses, (c) => c.token !== ts.SyntaxKind.ExtendsKeyword ||
              decl.kind === ts.SyntaxKind.InterfaceDeclaration);
      if (clause == null) {
        clause = <ts.HeritageClause>ts.createNode(ts.SyntaxKind.HeritageClause);
        clause.token = decl.kind === ts.SyntaxKind.InterfaceDeclaration ?
            ts.SyntaxKind.ExtendsKeyword :
            ts.SyntaxKind.ImplementsKeyword;
        clause.types = <ts.NodeArray<ts.ExpressionWithTypeArguments>>[];
        clause.parent = decl;
        base.copyLocation(decl, clause);
        clauses.push(clause);
      }
      let functionType =
          <ts.ExpressionWithTypeArguments>ts.createNode(ts.SyntaxKind.ExpressionWithTypeArguments);
      functionType.parent = clause;
      base.copyLocation(clause, functionType);
      let fn = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
      fn.text = 'Function';
      fn.parent = functionType;
      base.copyLocation(functionType, fn);
      functionType.expression = fn;
      clause.types.push(functionType);
    }
  }

  function gatherClasses(n: ts.Node, classes: {[name: string]: base.ClassLike}) {
    switch (n.kind) {
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration:
        let classDecl = <base.ClassLike>n;
        let name = classDecl.name.text;
        // TODO(jacobr): validate that the classes have consistent
        // modifiers, etc.
        if (classes.hasOwnProperty(name)) {
          let existing = classes[name];
          (classDecl.members as Array<ts.ClassElement>).forEach((e: ts.ClassElement) => {
            (existing.members as Array<ts.ClassElement>).push(e);
            e.parent = existing;
          });
          removeNode(classDecl);
        } else {
          classes[name] = classDecl;
          // Perform other class level post processing here.
          makeCallableClassesImplementFunction(classDecl);
        }
        break;
      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.SourceFile:
        let moduleClasses: {[name: string]: base.ClassLike} = {};
        ts.forEachChild(n, (child) => gatherClasses(child, moduleClasses));
        ts.forEachChild(n, (child) => mergeVariablesIntoClasses(child, moduleClasses));

        break;
      case ts.SyntaxKind.ModuleBlock:
        ts.forEachChild(n, (child) => gatherClasses(child, classes));
        break;
      default:
        break;
    }
  }
  gatherClasses(f, {});
}
