import path from 'node:path';
import { Node, type Project, type SourceFile, type TypeAliasDeclaration, type TypeElementTypes } from 'ts-morph';
import type { IsTestFileFn, Severity, UnusedPropertyResult } from '../types';
import { extractTodoComment } from './extractTodoComment';
import { isPropertyUnused, type PropertyUsageResult } from './isPropertyUnused';

export function analyzeTypeLiteralMember(
  member: TypeElementTypes,
  typeName: string,
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[],
  project: Project
): void {
  if (!Node.isPropertySignature(member)) {
    return;
  }

  const usage: PropertyUsageResult = isPropertyUnused(member, isTestFile, project);

  if (!usage.isUnusedOrTestOnly) {
    return;
  }

  const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());
  const todoComment: string | undefined = extractTodoComment(member);

  // Determine severity: warning for TODO, info for test-only, error for completely unused
  let severity: Severity = 'error';
  if (todoComment) {
    severity = 'warning';
  } else if (usage.onlyUsedInTests) {
    severity = 'info';
  }

  const propertyName: string = member.getName();
  const startPos: number = member.getStart();
  const lineStartPos: number = member.getStartLinePos();
  const character: number = startPos - lineStartPos + 1;
  const endCharacter: number = character + propertyName.length;
  const result: UnusedPropertyResult = {
    filePath: relativePath,
    typeName,
    propertyName,
    line: member.getStartLineNumber(),
    character,
    endCharacter,
    todoComment,
    severity,
    onlyUsedInTests: usage.onlyUsedInTests,
  };
  results.push(result);
}

export function analyzeTypeAlias(
  typeAlias: TypeAliasDeclaration,
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[],
  project: Project
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
    analyzeTypeLiteralMember(member, typeName, sourceFile, tsConfigDir, isTestFile, results, project);
  }
}

export function analyzeTypeAliases(
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[],
  project: Project
): void {
  const typeAliases: TypeAliasDeclaration[] = sourceFile.getTypeAliases();

  for (const typeAlias of typeAliases) {
    analyzeTypeAlias(typeAlias, sourceFile, tsConfigDir, isTestFile, results, project);
  }
}
