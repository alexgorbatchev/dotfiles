import type { SourceFile } from 'ts-morph';

export function hasNoCheck(sourceFile: SourceFile): boolean {
  const fullText: string = sourceFile.getFullText();
  const firstLine: string | undefined = fullText.split('\n')[0];
  if (!firstLine) {
    return false;
  }
  return firstLine.trim() === '// @ts-nocheck';
}
