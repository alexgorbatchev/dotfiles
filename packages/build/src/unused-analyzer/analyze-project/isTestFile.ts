import type { SourceFile } from 'ts-morph';

const TEST_FILE_EXTENSIONS: string[] = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

export function isTestFile(sourceFile: SourceFile): boolean {
  const filePath: string = sourceFile.getFilePath();

  return filePath.includes('__tests__') || TEST_FILE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}
