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
        case ts.SyntaxKind.NullKeyword:
          // No need to include the null type as all Dart types are nullable anyway.
          return;
        case ts.SyntaxKind.UnionType:
          let union = <ts.UnionTypeNode>t;
          union.types.forEach(this.merge.bind(this));
          return;
        case ts.SyntaxKind.IntersectionType:
          // Arbitrarily pick the first type of the intersection type as the merged type.
          // TODO(jacobr): re-evaluate this logic.
          let intersection = <ts.IntersectionTypeNode>t;
          this.merge(intersection.types[0]);
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
            if (!base.supportedTypeDeclaration(alias)) {
              if (typeRef.typeArguments) {
                console.log(
                    'Warning: typeReference with arguements not supported yet:' + t.getText());
              }

              this.merge(alias.type);
            }
            return;
          }
          break;
        default:
          break;
      }
      this.types.set(this.fc.generateDartTypeName(t, {insideComment: true}), t);
    }
  }

  toTypeNode(): ts.TypeNode {
    let names = Array.from(this.types.keys());
    if (names.length === 0) {
      return null;
    }
    if (names.length === 1) {
      return this.types.get(names[0]);
    }
    let union = <ts.UnionTypeNode>ts.createNode(ts.SyntaxKind.UnionType);
    base.copyLocation(this.types.get(names[0]), union);

    union.types = Array.from(this.types.values()) as ts.NodeArray<ts.TypeNode>;
    return union;
  }

  /**
   * Generate a type node where we have stripped out type features that Dart does not support.
   * Currently this means stripping out union types.
   */
  toSimpleTypeNode(): ts.TypeNode {
    let merged = this.toTypeNode();
    if (merged == null) return null;

    if (merged.kind === ts.SyntaxKind.UnionType) {
      // For union types find a Dart type that satisfies all the types.
      let types = (<ts.UnionTypeNode>merged).types;
      // Generate a common base type for an array of types.
      // The implemented is currently incomplete often returning null when there
      // might really be a valid common base type.
      let common: ts.TypeNode = types[0];
      for (let i = 1; i < types.length && common != null; ++i) {
        let type = types[i];
        common = this.fc.findCommonType(type, common);
      }
      return common;
    }
    return merged;
  }

  private types: Map<string, ts.TypeNode> = new Map();
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
    this.name.add(base.ident(param.name));
    if (!this.optional) {
      this.optional = !!param.questionToken;
    }
    this.type.merge(param.type);
  }

  toParameterDeclaration(): ts.ParameterDeclaration {
    let ret = <ts.ParameterDeclaration>ts.createNode(ts.SyntaxKind.Parameter);
    let nameIdentifier = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
    nameIdentifier.text = Array.from(this.name).join('_');
    ret.name = nameIdentifier;
    if (this.optional) {
      ret.questionToken = ts.createNode(ts.SyntaxKind.QuestionToken);
    }
    base.copyLocation(this.textRange, ret);
    ret.type = this.type.toTypeNode();
    return ret;
  }

  setOptional() {
    this.optional = true;
  }

  private name: Set<string> = new Set();
  private type: MergedType;
  private optional: boolean = false;
  private textRange: ts.Node;
}

/**
 * Handle a parameter that is the result of merging parameter declarations from
 * multiple method overloads.
 */
export class MergedTypeParameter {
  constructor(param: ts.TypeParameterDeclaration, fc: FacadeConverter) {
    this.constraint = new MergedType(fc);
    this.textRange = param;
    this.merge(param);
    this.name = base.ident(param.name);
  }

  merge(param: ts.TypeParameterDeclaration) {
    this.constraint.merge(param.constraint);
    // We ignore param.expression as it is not supported by Dart.
  }

  toTypeParameterDeclaration(): ts.TypeParameterDeclaration {
    let ret = <ts.TypeParameterDeclaration>ts.createNode(ts.SyntaxKind.TypeParameter);
    let nameIdentifier = <ts.Identifier>ts.createNode(ts.SyntaxKind.Identifier);
    nameIdentifier.text = this.name;
    ret.name = nameIdentifier;
    base.copyLocation(this.textRange, ret);
    let constraint = this.constraint.toTypeNode();
    // TODO(jacobr): remove this check once we have support for union types within comments.
    // We can't currently handle union types in merged type parameters as the comments for type
    // parameters in function types are not there for documentation and impact strong mode.
    if (constraint && constraint.kind !== ts.SyntaxKind.UnionType) {
      ret.constraint = constraint;
    }
    return ret;
  }

  private name: string;
  private constraint: MergedType;
  private textRange: ts.Node;
}

/**
 * Handle a parameter that is the result of merging parameter declarations from
 * multiple method overloads.
 */
export class MergedTypeParameters {
  private mergedParameters: Map<string, MergedTypeParameter> = new Map();
  private textRange: ts.TextRange;

  constructor(private fc: FacadeConverter) {}

  merge(params: ts.NodeArray<ts.TypeParameterDeclaration>) {
    if (!params) return;
    if (!this.textRange) {
      this.textRange = params;
    }
    for (let i = 0; i < params.length; i++) {
      let param = params[i];
      let name = base.ident(param.name);
      if (this.mergedParameters.has(name)) {
        let merged = this.mergedParameters.get(name);
        if (merged) {
          merged.merge(param);
        }
      } else {
        this.mergedParameters.set(name, new MergedTypeParameter(param, this.fc));
      }
    }
  }

  toTypeParameters(): ts.NodeArray<ts.TypeParameterDeclaration> {
    if (this.mergedParameters.size === 0) {
      return undefined;
    }

    let ret = [] as ts.NodeArray<ts.TypeParameterDeclaration>;
    base.copyNodeArrayLocation(this.textRange, ret);

    this.mergedParameters.forEach((mergedParameter) => {
      ret.push(mergedParameter.toTypeParameterDeclaration());
    });

    return ret;
  }
}

/**
 * Normalize a SourceFile
 */
export function normalizeSourceFile(f: ts.SourceFile, fc: FacadeConverter) {
  let modules: Map<string, ts.ModuleDeclaration> = new Map();

  // Merge top level modules.
  for (let i = 0; i < f.statements.length; ++i) {
    let statement = f.statements[i];
    if (statement.kind !== ts.SyntaxKind.ModuleDeclaration) continue;
    let moduleDecl = <ts.ModuleDeclaration>statement;
    let name = moduleDecl.name.text;
    if (modules.has(name)) {
      let srcBody = modules.get(name).body;
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
      modules.set(name, moduleDecl);
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

  function mergeVariablesIntoClasses(n: ts.Node, classes: Map<string, base.ClassLike>) {
    switch (n.kind) {
      case ts.SyntaxKind.VariableStatement:
        let statement = <ts.VariableStatement>n;
        statement.declarationList.declarations.forEach(function(
            declaration: ts.VariableDeclaration) {
          if (declaration.name.kind === ts.SyntaxKind.Identifier) {
            let name: string = (<ts.Identifier>(declaration.name)).text;
            let existingClass = classes.has(name);
            let hasConstructor = false;
            if (declaration.type) {
              let type: ts.TypeNode = declaration.type;
              if (type.kind === ts.SyntaxKind.TypeLiteral) {
                let literal = <ts.TypeLiteralNode>type;
                hasConstructor = literal.members.some((member: ts.Node) => {
                  return member.kind === ts.SyntaxKind.ConstructSignature;
                });
              } else if (type.kind === ts.SyntaxKind.TypeReference) {
                // Handle interfaces with constructors. As Dart does not support calling arbitrary
                // functions like constructors we need to upgrade the interface to be a class
                // so we call invoke the constructor on the interface class.
                // Example typescript library definition matching this pattern:
                //
                // interface XStatic {
                //   new (a: string, b): XStatic;
                //   foo();
                // }
                //
                // declare var X: XStatic;
                //
                // In JavaScript you could just write new X() and create an
                // instance of XStatic. We don't
                let typeRef = type as ts.TypeReferenceNode;
                let typeName = typeRef.typeName;
                let symbol = fc.tc.getSymbolAtLocation(typeName);
                if (symbol == null) return;
                let decl = fc.getSymbolDeclaration(symbol, typeName);
                if (decl == null) return;
                if (decl.kind !== ts.SyntaxKind.InterfaceDeclaration) return;
                let interfaceDecl = decl as base.ExtendedInterfaceDeclaration;
                if (!interfaceDecl.members.some((member) => {
                      return member.kind === ts.SyntaxKind.ConstructSignature;
                    }))
                  return;

                if (interfaceDecl.classLikeVariableDeclaration == null) {
                  // We could add extra logic to be safer such as only infering that variable names
                  // are class like for cases where variable names are UpperCamelCase matching JS
                  // conventions that a variable is a Class definition.
                  interfaceDecl.classLikeVariableDeclaration = declaration;
                }
              }
            }

            if (existingClass || hasConstructor) {
              if (!existingClass) {
                // Create a stub existing class to upgrade the object literal to if there is not an
                // existing class with the same name.
                let clazz = <ts.ClassDeclaration>ts.createNode(ts.SyntaxKind.ClassDeclaration);
                base.copyLocation(declaration, clazz);
                clazz.name = declaration.name as ts.Identifier;
                clazz.members = <ts.NodeArray<ts.ClassElement>>[];
                base.copyNodeArrayLocation(declaration, clazz.members);
                replaceNode(n, clazz);
                classes.set(name, clazz);
              }

              let existing = classes.get(name);
              if (existing.kind === ts.SyntaxKind.InterfaceDeclaration) {
                let interfaceDecl = existing as base.ExtendedInterfaceDeclaration;
                // It is completely safe to assume that we know the precise class like variable
                // declaration for the interface in this case as they have the same exact name.
                interfaceDecl.classLikeVariableDeclaration = declaration;
              }
              let members = existing.members as Array<ts.ClassElement>;
              if (declaration.type) {
                let type: ts.TypeNode = declaration.type;
                if (type.kind === ts.SyntaxKind.TypeLiteral) {
                  if (existingClass) {
                    removeNode(n);
                  }
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

  function replaceInArray(nodes: ts.NodeArray<ts.Node>, v: ts.Node, replacement: ts.Node) {
    for (let i = 0, len = nodes.length; i < len; ++i) {
      if (nodes[i] === v) {
        nodes[i] = replacement;
        break;
      }
    }
  }

  function replaceNode(n: ts.Node, replacement: ts.Node) {
    let parent = n.parent;
    replacement.parent = parent;
    switch (parent.kind) {
      case ts.SyntaxKind.ModuleBlock:
        let block = <ts.ModuleBlock>parent;
        replaceInArray(block.statements, n, replacement);
        break;
      case ts.SyntaxKind.SourceFile:
        let sourceFile = <ts.SourceFile>parent;
        replaceInArray(sourceFile.statements, n, replacement);
        break;
      default:
        throw 'replaceNode not implemented for kind:' + parent.kind;
    }
  }

  function gatherClasses(n: ts.Node, classes: Map<string, base.ClassLike>) {
    switch (n.kind) {
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.InterfaceDeclaration:
        let classDecl = <base.ClassLike>n;
        let name = classDecl.name.text;
        // TODO(jacobr): validate that the classes have consistent
        // modifiers, etc.
        if (classes.has(name)) {
          let existing = classes.get(name);
          (classDecl.members as Array<ts.ClassElement>).forEach((e: ts.ClassElement) => {
            (existing.members as Array<ts.ClassElement>).push(e);
            e.parent = existing;
          });
          removeNode(classDecl);
        } else {
          classes.set(name, classDecl);
          // Perform other class level post processing here.
        }
        break;
      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.SourceFile:
        let moduleClasses: Map<string, base.ClassLike> = new Map();
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
  gatherClasses(f, new Map());
}
