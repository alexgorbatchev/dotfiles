import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { SourceFile } from 'ts-morph';
import { analyzeProject } from '../analyzeProject';

const FIXTURES_DIR = path.join(import.meta.dir, 'test-fixtures');
const TSCONFIG_PATH = path.join(FIXTURES_DIR, 'tsconfig.json');

// Custom isTestFile for tests that only checks file extensions, not __tests__ directories
const TEST_FILE_EXTENSIONS: string[] = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
function isTestFileForTests(sourceFile: SourceFile): boolean {
  const filePath: string = sourceFile.getFilePath();
  return TEST_FILE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

describe('analyzeProject - property access detection', () => {
  test('does not report properties as unused when they are accessed via property access in same file', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    // InternalDatabaseRow properties are all accessed via row.id, row.name, etc. in the same file
    const internalRowProps = results.unusedProperties.filter((item) => item.typeName === 'InternalDatabaseRow');

    // These properties should NOT be in the unused list because they are accessed
    const unusedPropNames = internalRowProps.map((p) => p.propertyName);
    expect(unusedPropNames).not.toContain('id');
    expect(unusedPropNames).not.toContain('name');
    expect(unusedPropNames).not.toContain('created_at');
    expect(unusedPropNames).not.toContain('updated_at');

    // The test should fail initially if the bug exists
    expect(internalRowProps.length).toBe(0);
  });

  test('does not report properties as unused when accessed in different file', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    // UserData properties are accessed in database-processor.ts
    const userDataProps = results.unusedProperties.filter((item) => item.typeName === 'UserData');

    const unusedPropNames = userDataProps.map((p) => p.propertyName);
    expect(unusedPropNames).not.toContain('userId');
    expect(unusedPropNames).not.toContain('userName');
  });
});
