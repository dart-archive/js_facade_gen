import * as ts from 'typescript';

import * as base from './base';
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
          // We need to follow Alias types as Dart does not support them for non
          // function types. TODO(jacobr): handle them for Function types?
          const typeRef = <ts.TypeReferenceNode>t;
          const decl =
              this.fc.getTypeDeclarationOfSymbol(this.fc.getSymbolAtLocation(typeRef.typeName));
          if (decl && ts.isTypeAliasDeclaration(decl)) {
            const alias = decl;
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

    union.types = ts.createNodeArray(Array.from(this.types.values()));
    return union;
  }

  /**
   * Generate a type node where we have stripped out type features that Dart does not support.
   * Currently this means stripping out union types.
   */
  toSimpleTypeNode(): ts.TypeNode {
    let merged = this.toTypeNode();
    if (merged == null) return null;

    if (ts.isUnionTypeNode(merged)) {
      // For union types find a Dart type that satisfies all the types.
      let types = merged.types;
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
    nameIdentifier.escapedText = ts.escapeLeadingUnderscores(Array.from(this.name).join('_'));
    ret.name = nameIdentifier;
    if (this.optional) {
      ret.questionToken = ts.createToken(ts.SyntaxKind.QuestionToken);
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
  private optional = false;
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
    nameIdentifier.escapedText = ts.escapeLeadingUnderscores(this.name);
    ret.name = nameIdentifier;
    base.copyLocation(this.textRange, ret);
    let constraint = this.constraint.toTypeNode();
    // TODO(jacobr): remove this check once we have support for union types within comments.
    // We can't currently handle union types in merged type parameters as the comments for type
    // parameters in function types are not there for documentation and impact strong mode.
    if (constraint && !ts.isUnionTypeNode(constraint)) {
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

    const parameters: ts.TypeParameterDeclaration[] = [];

    this.mergedParameters.forEach((mergedParameter) => {
      parameters.push(mergedParameter.toTypeParameterDeclaration());
    });

    const ret = ts.createNodeArray(parameters);
    base.copyNodeArrayLocation(this.textRange, ret);

    return ret;
  }
}

/**
 * Represents a merged class member. If the member was not overloaded, the constituents array
 * will contain only the original declaration and mergedDeclaration will just be the original
 * declaration. If the member was an overloaded method, the constituents array will contain all
 * overloaded declarations and mergedDeclaration will contain the result of merging the overloads.
 */
export class MergedMember {
  constructor(
      public constituents: ts.SignatureDeclaration[],
      public mergedDeclaration: ts.SignatureDeclaration) {}

  isOverloaded(): boolean {
    return this.constituents.length > 1;
  }
}

/**
 * Normalize a SourceFile.
 */
export function normalizeSourceFile(
    f: ts.SourceFile, fc: FacadeConverter, fileSet: Set<string>, renameConflictingTypes = false,
    explicitStatic = false) {
  const nodeReplacements: Map<ts.Node, ts.Node> = new Map();
  const modules: Map<string, ts.ModuleDeclaration> = new Map();

  // Merge top level modules.
  for (let i = 0; i < f.statements.length; ++i) {
    const statement = f.statements[i];
    if (!ts.isModuleDeclaration(statement)) {
      continue;
    }
    const moduleDecl: ts.ModuleDeclaration = statement;
    const name = base.getModuleName(moduleDecl);
    const moduleBlock = base.getModuleBlock(moduleDecl);
    if (modules.has(name)) {
      const srcBodyBlock = base.getModuleBlock(modules.get(name));

      Array.prototype.push.apply(srcBodyBlock.statements, moduleBlock.statements);
    } else {
      modules.set(name, moduleDecl);
    }
  }

  function addModifier(n: ts.Node, modifier: ts.Node) {
    if (!n.modifiers) {
      n.modifiers = ts.createNodeArray();
    }
    modifier.parent = n;
    // Small hack to get around NodeArrays being readonly
    Array.prototype.push.call(n.modifiers, modifier);
  }

  /**
   * Searches for a constructor member within a type literal or an interface. If found, it returns
   * that member. Otherwise, it returns undefined.
   */
  function findConstructorInType(declaration: ts.TypeLiteralNode|
                                 ts.InterfaceDeclaration): base.Constructor|undefined {
    // Example TypeScript definition matching the type literal case:
    //
    // declare interface XType {
    //   a: string;
    //   b: number;
    //   c(): boolean;
    // }
    //
    // declare var X: {
    //   prototype: XType,
    //   new(a: string, b: number): XType,
    // };
    //
    // Possible underlying implementation:
    // var X = class {
    //   constructor(public a: string, public b: number) {}
    //   c(): boolean { return this.b.toString() === this.a }
    // }
    //
    // In TypeScript you could just write new X('abc', 123) and create an instance of
    // XType. Dart doesn't support this when X is a variable, so X must be upgraded to be
    // a class.

    // Example TypeScript definition matching the interface case:
    //
    // interface XType {
    //   a: string;
    //   b: number;
    //   c(): boolean;
    // }
    //
    // interface X {
    //   new (a: string, b: number): XType;
    // }
    //
    // declare var X: X;
    //
    // Possible underlying implementation:
    // var X: X = class {
    //   constructor(public a: string, public b: number) {}
    //   c(): boolean { return this.b.toString() === this.a }
    // }
    //
    // In TypeScript you could just write new X('abc', 123) and create an instance of
    // XType. Dart doesn't support this when X is a variable, so X must be upgraded to
    // be a class.

    return declaration.members.find(base.isConstructor) as base.Constructor;
  }

  /**
   * Returns the type of object created by a given constructor.
   */
  function getConstructedObjectType(constructor: base.Constructor): ts.ObjectTypeDeclaration|
      undefined {
    const constructedTypeSymbol: ts.Symbol = constructor &&
        ts.isTypeReferenceNode(constructor.type) &&
        fc.tc.getTypeAtLocation(constructor.type).getSymbol();
    if (!constructedTypeSymbol) {
      return;
    }

    // The constructed type can be a type literal, an interface, or a class.
    return constructedTypeSymbol.declarations.find((member: ts.TypeElement) => {
      if (ts.isTypeLiteralNode(member)) {
        return true;
      } else if (ts.isInterfaceDeclaration(member)) {
        // Check if the interface was declared within a user-specified input file to
        // prevent emitting classes for TS internal library types.
        const fileName = member.getSourceFile().fileName;
        return fileSet.has(fileName);
      } else if (ts.isClassDeclaration(member)) {
        return true;
      }
      return false;
    }) as ts.ObjectTypeDeclaration |
        undefined;
  }

  function mergeVariablesIntoClasses(n: ts.Node, classes: Map<string, base.ClassLike>) {
    // In TypeScript, a constructor may be represented by an object whose type contains a "new"
    // method. When a variable has a type with a "new" method, it means that the variable must
    // either be an ES6 class or the equivalent desugared constructor function. As Dart does not
    // support calling arbitrary functions like constructors, we need to upgrade the variable to be
    // a class with the appropriate members so that we can invoke the constructor on that class.
    if (ts.isVariableStatement(n)) {
      const statement = n;
      statement.declarationList.declarations.forEach((variableDecl: ts.VariableDeclaration) => {
        if (ts.isIdentifier(variableDecl.name)) {
          const name = base.ident(variableDecl.name);
          const variableType = variableDecl.type;
          if (!variableType) {
            return;
          }

          // We need to find the declaration of the variable's type in order to acccess the
          // members of that type.
          let variableTypeDeclaration: ts.TypeLiteralNode|ts.InterfaceDeclaration;
          if (ts.isTypeReferenceNode(variableType)) {
            variableTypeDeclaration =
                fc.getDeclarationOfReferencedType(variableType, (declaration: ts.Declaration) => {
                  return ts.isTypeLiteralNode(declaration) ||
                      ts.isInterfaceDeclaration(declaration);
                }) as ts.TypeLiteralNode | ts.InterfaceDeclaration;
          } else if (ts.isTypeLiteralNode(variableType)) {
            variableTypeDeclaration = variableType;
          }
          if (!variableTypeDeclaration) {
            return;
          }

          // Try to find a Constructor within the variable's type.
          const constructor: base.Constructor = findConstructorInType(variableTypeDeclaration);
          if (constructor) {
            // Get the type of object that the constructor creates.
            const constructedType = getConstructedObjectType(constructor);

            if (classes.has(name)) {
              const existing = classes.get(name);
              // If a class or interface with the same name as the variable already exists, we
              // should suppress that declaration because it will be cloned into a stub class or
              // interface below.
              nodeReplacements.set(existing, undefined);
            }

            // These properties do not exist on TypeLiteralNodes.
            let clazzTypeParameters, clazzHeritageClauses;
            if (ts.isClassDeclaration(constructedType) ||
                ts.isInterfaceDeclaration(constructedType)) {
              clazzTypeParameters = base.cloneNodeArray(constructedType.typeParameters);
              clazzHeritageClauses = base.cloneNodeArray(constructedType.heritageClauses);
            }

            let clazz: ts.InterfaceDeclaration|ts.ClassDeclaration;
            if (ts.isClassDeclaration(constructedType)) {
              clazz = ts.createClassDeclaration(
                  base.cloneNodeArray(constructedType.decorators),
                  base.cloneNodeArray(constructedType.modifiers),
                  ts.createIdentifier(base.ident(variableDecl.name)),
                  base.cloneNodeArray(clazzTypeParameters),
                  base.cloneNodeArray(clazzHeritageClauses),
                  base.cloneNodeArray(constructedType.members));
            } else if (
                ts.isTypeLiteralNode(constructedType) ||
                ts.isInterfaceDeclaration(constructedType)) {
              // TODO(derekx): Try creating abstract class declarations in these cases.
              // InterfaceDeclarations get emitted as abstract classes regardless, it would just
              // make the JSON output more accurate.
              clazz = ts.createInterfaceDeclaration(
                  base.cloneNodeArray(constructedType.decorators),
                  base.cloneNodeArray(constructedType.modifiers),
                  ts.createIdentifier(base.ident(variableDecl.name)),
                  base.cloneNodeArray(clazzTypeParameters),
                  base.cloneNodeArray(clazzHeritageClauses),
                  base.cloneNodeArray(constructedType.members));
              (clazz as base.ExtendedInterfaceDeclaration).constructedType = constructedType;
            }

            base.copyLocation(variableDecl, clazz);
            clazz.flags = variableDecl.flags;
            nodeReplacements.set(n, clazz);
            classes.set(name, clazz);
          } else {
            if (renameConflictingTypes) {
              // If we cannot find a constructor within the variable's type and the
              // --rename-conflicting-types flag is set, we need to check whether or not a type
              // with the same name as the variable already exists. If it does, we must rename it.
              // That type is not directly associated with this variable, so they cannot be
              // combined.
              const variableSymbol = fc.getSymbolAtLocation(variableDecl.name);
              if (variableSymbol.getDeclarations()) {
                for (const declaration of variableSymbol.getDeclarations()) {
                  if (ts.isInterfaceDeclaration(declaration) ||
                      ts.isTypeAliasDeclaration(declaration)) {
                    declaration.name.escapedText = ts.escapeLeadingUnderscores(name + 'Type');
                  }
                }
              }
              return;
            } else if (!renameConflictingTypes && classes.has(name)) {
              // If we cannot find a constructor and there exists a class with the exact same name,
              // we assume by default that the variable and type are related as they have the exact
              // same name. Thus, the variable declaration is suppressed and the members of its type
              // are merged into the existing class below.
              nodeReplacements.set(variableDecl, undefined);
            }
          }

          // Merge the members of the variable's type into the existing class.
          const existing = classes.get(name);
          if (!existing) {
            return;
          }

          const members = existing.members;
          variableTypeDeclaration.members.forEach((member: ts.TypeElement|ts.ClassElement) => {
            // Array.prototype.push is used below as a small hack to get around NodeArrays being
            // readonly.
            switch (member.kind) {
              case ts.SyntaxKind.Constructor:
              case ts.SyntaxKind.ConstructorType:
              case ts.SyntaxKind.ConstructSignature: {
                const clonedConstructor = ts.getMutableClone(member);
                clonedConstructor.name = ts.getMutableClone(variableDecl.name) as ts.PropertyName;
                clonedConstructor.parent = existing;

                const existingConstructIndex = members.findIndex(base.isConstructor);
                if (existingConstructIndex === -1) {
                  Array.prototype.push.call(members, clonedConstructor);
                } else {
                  Array.prototype.splice.call(members, existingConstructIndex, clonedConstructor);
                }
              } break;
              case ts.SyntaxKind.MethodSignature:
                member.parent = existing;
                Array.prototype.push.call(members, member);
                break;
              case ts.SyntaxKind.PropertySignature:
                // TODO(derekx): This should also be done to methods.
                if (!explicitStatic) {
                  // Finds all existing declarations of this property in the inheritance
                  // hierarchy of this class.
                  const existingDeclarations =
                      findPropertyInHierarchy(base.ident(member.name), existing, classes);

                  if (existingDeclarations.size) {
                    for (const existingDecl of existingDeclarations) {
                      addModifier(existingDecl, ts.createModifier(ts.SyntaxKind.StaticKeyword));
                    }
                  }
                }

                // If needed, add declaration of property to the interface that we are
                // currently handling.
                if (!findPropertyInClass(base.ident(member.name), existing)) {
                  if (!explicitStatic) {
                    addModifier(member, ts.createModifier(ts.SyntaxKind.StaticKeyword));
                  }
                  member.parent = existing;
                  Array.prototype.push.call(members, member);
                }
                break;
              case ts.SyntaxKind.IndexSignature:
                member.parent = existing;
                Array.prototype.push.call(members, member);
                break;
              case ts.SyntaxKind.CallSignature:
                member.parent = existing;
                Array.prototype.push.call(members, member);
                break;
              default:
                throw 'Unhandled TypeLiteral member type:' + member.kind;
            }
          });
        } else {
          throw 'Unexpected VariableStatement identifier kind';
        }
      });
    } else if (ts.isModuleBlock(n)) {
      ts.forEachChild(n, (child) => mergeVariablesIntoClasses(child, classes));
    }
  }

  function findPropertyInClass(propName: string, classLike: base.ClassLike): ts.ClassElement|
      undefined {
    const members = classLike.members as ts.NodeArray<ts.ClassElement>;
    return members.find((member: ts.ClassElement) => {
      if (member.name && base.ident(member.name) === propName) {
        return true;
      }
    });
  }

  function findPropertyInHierarchy(
      propName: string, classLike: base.ClassLike,
      classes: Map<string, base.ClassLike>): Set<ts.ClassElement> {
    const propertyDeclarations = new Set<ts.ClassElement>();
    const declaration = findPropertyInClass(propName, classLike);
    if (declaration) propertyDeclarations.add(declaration);

    const heritageClauses = classLike.heritageClauses || ts.createNodeArray();
    for (const clause of heritageClauses) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
        continue;
      }
      const name = base.ident(clause.types[0].expression);
      // TODO(derekx): We currently only look up ancestor nodes using the classes map. This is
      // because the classes map contains references to the modified versions of nodes. If the
      // ancestor is declared in a different file, it won't be found this way. Determine a way to
      // resolve this issue. One possibility would be to refactor the classes map so that it could
      // be shared among all files.
      if (!classes.has(name)) {
        continue;
      }
      const declarationsInAncestors = findPropertyInHierarchy(propName, classes.get(name), classes);
      if (declarationsInAncestors.size) {
        declarationsInAncestors.forEach(decl => propertyDeclarations.add(decl));
      }
    }
    return propertyDeclarations;
  }

  function gatherClasses(n: ts.Node, classes: Map<string, base.ClassLike>) {
    if (ts.isClassExpression(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) {
      let classDecl = <base.ClassLike>n;
      let name = classDecl.name.text;
      // TODO(jacobr): validate that the classes have consistent
      // modifiers, etc.
      if (classes.has(name)) {
        let existing = classes.get(name);
        (classDecl.members as ts.NodeArray<ts.ClassElement>).forEach((e: ts.ClassElement) => {
          // Small hack to get around NodeArrays being readonly
          Array.prototype.push.call(existing.members, e);
          e.parent = existing;
        });
        nodeReplacements.set(classDecl, undefined);
      } else {
        classes.set(name, classDecl);
        // Perform other class level post processing here.
      }
    } else if (ts.isModuleDeclaration(n) || ts.isSourceFile(n)) {
      const moduleClasses: Map<string, base.ClassLike> = new Map();
      ts.forEachChild(n, (child) => gatherClasses(child, moduleClasses));
      ts.forEachChild(n, (child) => mergeVariablesIntoClasses(child, moduleClasses));
    } else if (ts.isModuleBlock(n)) {
      ts.forEachChild(n, (child) => gatherClasses(child, classes));
    }
  }

  /**
   * AST transformer that handles nodes that we have marked for removal or replacement during
   * mergeVariablesIntoClasses.
   */
  function handleModifiedNodes(context: ts.TransformationContext) {
    const visit: ts.Visitor = (node: ts.Node) => {
      if (nodeReplacements.has(node)) {
        return nodeReplacements.get(node);
      }
      return ts.visitEachChild(node, (child) => visit(child), context);
    };
    return (node: ts.SourceFile) => ts.visitNode(node, visit);
  }

  gatherClasses(f, new Map());
  return ts.transform(f, [handleModifiedNodes]).transformed[0];
}
