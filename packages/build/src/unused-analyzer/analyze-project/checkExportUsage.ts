import path from 'node:path';
import { Node, type ReferencedSymbol, type SourceFile } from 'ts-morph';
import type { ExportKind, IsTestFileFn, Severity, UnusedExportResult } from '../types';

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

function getNameNode(declaration: Node): Node | undefined {
  if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isClassDeclaration(declaration) ||
    Node.isInterfaceDeclaration(declaration) ||
    Node.isTypeAliasDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration) ||
    Node.isVariableDeclaration(declaration)
  ) {
    return declaration.getNameNode();
  }
  return undefined;
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

  // Count references by type
  let totalReferences = 0;
  let testReferences = 0;
  let nonTestReferences = 0;

  for (const refGroup of references) {
    const refs = refGroup.getReferences();
    for (const ref of refs) {
      const refSourceFile: SourceFile = ref.getSourceFile();
      totalReferences++;
      if (isTestFile(refSourceFile)) {
        testReferences++;
      } else {
        nonTestReferences++;
      }
    }
  }

  // An export is unused if it only has 1 reference (the definition itself)
  const onlyUsedInTests: boolean = nonTestReferences === 1 && testReferences > 0;

  if (totalReferences > 1 && !onlyUsedInTests) {
    return null; // Used in production code
  }

  const kind: ExportKind = getExportKind(firstDeclaration);
  const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());

  // Determine severity: info for test-only, error for completely unused
  const severity: Severity = onlyUsedInTests ? 'info' : 'error';

  // Get the name node for accurate position highlighting
  const nameNode: Node | undefined = getNameNode(firstDeclaration);
  const positionNode: Node = nameNode || firstDeclaration;
  const startPos: number = positionNode.getStart();
  const lineStartPos: number = positionNode.getStartLinePos();
  const character: number = startPos - lineStartPos + 1;
  const endCharacter: number = character + exportName.length;

  const result: UnusedExportResult = {
    filePath: relativePath,
    exportName,
    line: firstDeclaration.getStartLineNumber(),
    character,
    endCharacter,
    kind,
    severity,
    onlyUsedInTests,
  };
  return result;
}
