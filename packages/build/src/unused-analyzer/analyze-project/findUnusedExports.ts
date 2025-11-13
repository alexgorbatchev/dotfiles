import path from 'node:path';
import type { Project } from 'ts-morph';
import type { IsTestFileFn, UnusedExportResult } from '../types';
import { checkExportUsage } from './checkExportUsage';
import { hasNoCheck } from './hasNoCheck';

export function findUnusedExports(
  project: Project,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  onProgress?: (filePath: string) => void,
  targetFilePath?: string
): UnusedExportResult[] {
  const results: UnusedExportResult[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (isTestFile(sourceFile)) {
      continue;
    }

    if (hasNoCheck(sourceFile)) {
      continue;
    }

    if (targetFilePath && sourceFile.getFilePath() !== targetFilePath) {
      continue;
    }

    if (onProgress) {
      const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());
      onProgress(relativePath);
    }

    const exports = sourceFile.getExportedDeclarations();

    for (const [exportName, declarations] of exports.entries()) {
      const unusedExport: UnusedExportResult | null = checkExportUsage(
        exportName,
        declarations,
        sourceFile,
        tsConfigDir,
        isTestFile
      );
      if (unusedExport) {
        results.push(unusedExport);
      }
    }
  }

  return results;
}
