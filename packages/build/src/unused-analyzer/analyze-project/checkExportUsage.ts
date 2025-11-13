import path from 'node:path';
import { Node, type ReferencedSymbol, type SourceFile } from 'ts-morph';
import type { ExportKind, IsTestFileFn, UnusedExportResult } from '../types';

function getExportKind(declaration: Node): ExportKind {
  if (Node.isFunctionDeclaration(declaration)) {
    return 'function';
  }
  if (Node.isClassDeclaration(declaration)) {
    return 'class';
  }
  if (Node.isInterfaceDeclaration(declaration)) {
    return 'interface';
  }
  if (Node.isTypeAliasDeclaration(declaration)) {
    return 'type';
  }
  if (Node.isEnumDeclaration(declaration)) {
    return 'enum';
  }
  if (Node.isModuleDeclaration(declaration)) {
    return 'namespace';
  }
  if (Node.isVariableDeclaration(declaration)) {
    const parent = declaration.getParent();
    if (Node.isVariableDeclarationList(parent)) {
      const declarationKind = parent.getDeclarationKind();
      if (declarationKind === 'const') {
        return 'const';
      }
    }
    return 'variable';
  }
  return 'export';
}

export function checkExportUsage(
  exportName: string,
  declarations: readonly Node[],
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn
): UnusedExportResult | null {
  const firstDeclaration: Node | undefined = declarations[0];
  if (!firstDeclaration) {
    return null;
  }

  // Only report symbols defined in this file, not re-exports
  const declarationSourceFile: SourceFile = firstDeclaration.getSourceFile();
  if (declarationSourceFile.getFilePath() !== sourceFile.getFilePath()) {
    return null;
  }

  if (!Node.isReferenceFindable(firstDeclaration)) {
    return null;
  }

  const references: ReferencedSymbol[] = firstDeclaration.findReferences();

  // Count total non-test references
  let totalReferences = 0;
  for (const refGroup of references) {
    const refs = refGroup.getReferences();
    for (const ref of refs) {
      const refSourceFile: SourceFile = ref.getSourceFile();
      if (!isTestFile(refSourceFile)) {
        totalReferences++;
      }
    }
  }

  // An export is unused if it only has 1 reference (the definition itself)
  // If it has more than 1 reference, at least one is an actual usage (same file or different file)
  if (totalReferences > 1) {
    return null;
  }

  const kind: ExportKind = getExportKind(firstDeclaration);
  const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());
  const result: UnusedExportResult = {
    filePath: relativePath,
    exportName,
    line: firstDeclaration.getStartLineNumber(),
    kind,
  };
  return result;
}
