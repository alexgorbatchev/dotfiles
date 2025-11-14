import path from 'node:path';
import type { InterfaceDeclaration, Project, SourceFile } from 'ts-morph';
import type { IsTestFileFn, Severity, UnusedPropertyResult } from '../types';
import { extractTodoComment } from './extractTodoComment';
import { isPropertyUnused, type PropertyUsageResult } from './isPropertyUnused';

export function analyzeInterfaces(
  sourceFile: SourceFile,
  tsConfigDir: string,
  isTestFile: IsTestFileFn,
  results: UnusedPropertyResult[],
  project: Project
): void {
  const interfaces: InterfaceDeclaration[] = sourceFile.getInterfaces();

  for (const iface of interfaces) {
    const interfaceName: string = iface.getName();

    for (const prop of iface.getProperties()) {
      const usage: PropertyUsageResult = isPropertyUnused(prop, isTestFile, project);

      if (usage.isUnusedOrTestOnly) {
        const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());
        const todoComment: string | undefined = extractTodoComment(prop);

        // Determine severity: warning for TODO, info for test-only, error for completely unused
        let severity: Severity = 'error';
        if (todoComment) {
          severity = 'warning';
        } else if (usage.onlyUsedInTests) {
          severity = 'info';
        }

        const propertyName: string = prop.getName();
        const startPos: number = prop.getStart();
        const lineStartPos: number = prop.getStartLinePos();
        const character: number = startPos - lineStartPos + 1;
        const endCharacter: number = character + propertyName.length;
        const result: UnusedPropertyResult = {
          filePath: relativePath,
          typeName: interfaceName,
          propertyName,
          line: prop.getStartLineNumber(),
          character,
          endCharacter,
          todoComment,
          severity,
          onlyUsedInTests: usage.onlyUsedInTests,
        };
        results.push(result);
      }
    }
  }
}
