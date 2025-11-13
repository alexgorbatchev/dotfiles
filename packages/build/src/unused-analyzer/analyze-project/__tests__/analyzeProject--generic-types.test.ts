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

describe('analyzeProject - generic type parameter detection', () => {
  test('does not report interface as unused when used as generic type parameter', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    // StepParams is used as a type parameter in: extends BaseStep<StepParams>
    // It should NOT be reported as unused
    const stepParamsExport = results.unusedExports.find(
      (item) => item.exportName === 'StepParams' && item.filePath.includes('generic-types.ts')
    );

    expect(stepParamsExport).toBeUndefined();
  });
});
