import * as ts from 'typescript';

import {ExportAssignment, ExportDeclaration, ImportDeclaration, ModuleDeclaration} from './module_declarations';
import {CallSignatureDeclaration, ClassDeclaration, ConstructorDeclaration, ConstructSignatureDeclaration, FunctionDeclaration, GetAccessorDeclaration, InterfaceDeclaration, MemberDeclaration, MethodDeclaration, ParameterDeclaration, PropertyDeclaration, SetAccessorDeclaration, TypeAliasDeclaration, TypeParameterDeclaration, VariableDeclaration} from './named_declarations';
import {Node} from './node';
import {SourceFile} from './source_file';
import {FunctionType, isKeywordTypeNode, KeywordType, LiteralType, Type, TypeLiteral, TypeReference} from './types';
import {VariableStatement} from './variable_statement';

/**
 * The conversion helpers may return undefined when the input TS node doesn't contain useful
 * information. This function is used to filter undefined out of arrays before serializing the
 * converted AST to JSON.
 */
export function filterUndefined(node: Node): boolean {
  return node !== undefined;
}

/**
 * Helper function that converts Names into strings.
 */
export function convertName(node: ts.DeclarationName|ts.EntityName|ts.BindingName|
                            ts.QualifiedName): string {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isQualifiedName(node)) {
    const leftName = convertName(node.left);
    if (leftName) {
      return leftName + '.' + convertName(node.right);
    }
  }
  const error = new Error(`Unexpected Name kind: ${ts.SyntaxKind[node.kind]}`);
  error.name = 'DartFacadeError';
  throw error;
}

/**
 * Helper function that converts Expressions into strings.
 */
export function convertExpression(node: ts.Expression): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isStringLiteralLike(node)) {
    return `'${node.text}'`;
  }
  const error = new Error(`Unexpected Expression kind: ${ts.SyntaxKind[node.kind]}`);
  error.name = 'DartFacadeError';
  throw error;
}

/**
 * Takes in a ts.SourceFile and returns a new SourceFile object that is compatible with Dart and can
 * be serialized to JSON.
 */
export function convertAST(node: ts.SourceFile): SourceFile {
  return new SourceFile(node);
}

export function convertNode(node: ts.Node): Node|undefined {
  if (ts.isImportDeclaration(node)) {
    return new ImportDeclaration(node);
  } else if (ts.isExportDeclaration(node)) {
    return new ExportDeclaration(node);
  } else if (ts.isExportAssignment(node)) {
    return new ExportAssignment(node);
  } else if (ts.isModuleDeclaration(node)) {
    return new ModuleDeclaration(node);
  } else if (ts.isVariableDeclaration(node)) {
    return new VariableDeclaration(node);
  } else if (ts.isVariableStatement(node)) {
    return new VariableStatement(node);
  } else if (ts.isFunctionDeclaration(node)) {
    return new FunctionDeclaration(node);
  } else if (ts.isClassLike(node)) {
    return new ClassDeclaration(node);
  } else if (ts.isInterfaceDeclaration(node)) {
    return new InterfaceDeclaration(node);
  } else if (ts.isTypeAliasDeclaration(node)) {
    return new TypeAliasDeclaration(node);
  } else if (node.kind === ts.SyntaxKind.EndOfFileToken) {
    // no-op
    return undefined;
  } else {
    const error = new Error(`Unexpected Node kind ${ts.SyntaxKind[node.kind]}`);
    error.name = 'DartFacadeError';
    throw error;
  }
}

export function convertTypeParameter(typeParam: ts.TypeParameterDeclaration):
    TypeParameterDeclaration {
  return new TypeParameterDeclaration(typeParam);
}

export function convertTypeNode(node: ts.TypeNode): Type {
  if (isKeywordTypeNode(node)) {
    return convertKeywordTypeNode(node);
  } else if (ts.isTypeReferenceNode(node)) {
    return new TypeReference(node);
  } else if (ts.isTypeLiteralNode(node)) {
    return new TypeLiteral(node);
  } else if (ts.isLiteralTypeNode(node)) {
    return undefined;
  } else if (ts.isFunctionTypeNode(node)) {
    return new FunctionType(node);
  } else {
    const error = new Error(`Unexpected TypeNode kind: ${ts.SyntaxKind[node.kind]}`);
    error.name = 'DartFacadeError';
    throw error;
  }
}

export function convertKeywordTypeNode(node: ts.KeywordTypeNode): KeywordType {
  switch (node.kind) {
    case ts.SyntaxKind.AnyKeyword:
      return new KeywordType(node, 'any');
    case ts.SyntaxKind.UnknownKeyword:
      return new KeywordType(node, 'unknown');
    case ts.SyntaxKind.NumberKeyword:
      return new KeywordType(node, 'number');
    case ts.SyntaxKind.BigIntKeyword:
      return new KeywordType(node, 'bigint');
    case ts.SyntaxKind.ObjectKeyword:
      return new KeywordType(node, 'object');
    case ts.SyntaxKind.BooleanKeyword:
      return new KeywordType(node, 'boolean');
    case ts.SyntaxKind.StringKeyword:
      return new KeywordType(node, 'string');
    case ts.SyntaxKind.SymbolKeyword:
      return new KeywordType(node, 'symbol');
    case ts.SyntaxKind.ThisKeyword:
      return new KeywordType(node, 'this');
    case ts.SyntaxKind.VoidKeyword:
      return new KeywordType(node, 'void');
    case ts.SyntaxKind.UndefinedKeyword:
      return new KeywordType(node, 'undefined');
    case ts.SyntaxKind.NullKeyword:
      return new KeywordType(node, 'null');
    case ts.SyntaxKind.NeverKeyword:
      return new KeywordType(node, 'never');
    default:
      const error =
          new Error(`Unexpected KeywordTypeNode kind: ${ts.SyntaxKind[(node as ts.Node).kind]}`);
      error.name = 'DartFacadeError';
      throw error;
  }
}

export function convertLiteralTypeNode(node: ts.LiteralTypeNode): LiteralType {
  if (ts.isLiteralExpression(node)) {
    return new LiteralType(node, node.text);
  } else {
    switch (node.literal.kind) {
      case ts.SyntaxKind.TrueKeyword:
        return new LiteralType(node, 'true');
      case ts.SyntaxKind.FalseKeyword:
        return new LiteralType(node, 'false');
      default:
        const error = new Error(`Unexpected LiteralTypeNode kind: ${ts.SyntaxKind[(node.kind)]}`);
        error.name = 'DartFacadeError';
        throw error;
    }
  }
}

export function convertMember(member: ts.ClassElement|ts.TypeElement): MemberDeclaration {
  if (ts.isSemicolonClassElement(member)) {
    return undefined;
  }
  if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
    return new PropertyDeclaration(member);
  }
  if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
    return new MethodDeclaration(member);
  }
  if (ts.isConstructorDeclaration(member)) {
    return new ConstructorDeclaration(member);
  }
  if (ts.isConstructSignatureDeclaration(member)) {
    return new ConstructSignatureDeclaration(member);
  }
  if (ts.isGetAccessor(member)) {
    return new GetAccessorDeclaration(member);
  }
  if (ts.isSetAccessor(member)) {
    return new SetAccessorDeclaration(member);
  }
  if (ts.isCallSignatureDeclaration(member)) {
    return new CallSignatureDeclaration(member);
  }
  const error = new Error(`Unexpected Member kind: ${ts.SyntaxKind[member.kind]}`);
  error.name = 'DartFacadeError';
  throw error;
}

export function convertParameter(parameter: ts.ParameterDeclaration) {
  return new ParameterDeclaration(parameter);
}
