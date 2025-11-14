import path from 'node:path';
import type { InterfaceDeclaration, Project, SourceFile } from 'ts-morph';
import type { IsTestFileFn, UnusedPropertyResult } from '../types';
import { extractTodoComment } from './extractTodoComment';
import { isPropertyUnused } from './isPropertyUnused';

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
      if (isPropertyUnused(prop, isTestFile, project)) {
        const relativePath: string = path.relative(tsConfigDir, sourceFile.getFilePath());
        const todoComment: string | undefined = extractTodoComment(prop);
        const result: UnusedPropertyResult = {
          filePath: relativePath,
          typeName: interfaceName,
          propertyName: prop.getName(),
          line: prop.getStartLineNumber(),
          todoComment,
        };
        results.push(result);
      }
    }
  }
}
