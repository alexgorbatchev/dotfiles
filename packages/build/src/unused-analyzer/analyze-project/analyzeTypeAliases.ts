import path from 'node:path';
import { Node, type SourceFile, type TypeAliasDeclaration, type TypeElementTypes } from 'ts-morph';
import type { IsTestFileFn, UnusedPropertyResult } from '../types';
import { isPropertyUnused } from './isPropertyUnused';

export function analyzeTypeLiteralMember(
  member: TypeElementTypes,
  typeName: string,
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[]
): void {
  if (!Node.isPropertySignature(member)) {
    return;
  }

  if (!isPropertyUnused(member, isTestFile)) {
    return;
  }

  const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());
  const result: UnusedPropertyResult = {
    filePath: relativePath,
    typeName,
    propertyName: member.getName(),
    line: member.getStartLineNumber(),
  };
  results.push(result);
}

export function analyzeTypeAlias(
  typeAlias: TypeAliasDeclaration,
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[]
): void {
  const typeName: string = typeAlias.getName();
  const typeNode = typeAlias.getTypeNode();

  if (!typeNode) {
    return;
  }

  if (!Node.isTypeLiteral(typeNode)) {
    return;
  }

  for (const member of typeNode.getMembers()) {
    analyzeTypeLiteralMember(member, typeName, sourceFile, tsConfigDir, isTestFile, results);
  }
}

export function analyzeTypeAliases(
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[]
): void {
  const typeAliases: TypeAliasDeclaration[] = sourceFile.getTypeAliases();

  for (const typeAlias of typeAliases) {
    analyzeTypeAlias(typeAlias, sourceFile, tsConfigDir, isTestFile, results);
  }
}
