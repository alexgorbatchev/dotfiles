import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import path from 'node:path';
import type { SourceFile } from 'ts-morph';
import { analyzeProject } from '../analyzeProject';

const FIXTURES_DIR = path.join(import.meta.dir, 'test-fixtures');
const TSCONFIG_PATH = path.join(FIXTURES_DIR, 'tsconfig.json');

const TEST_FILE_EXTENSIONS: string[] = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
function isTestFileForTests(sourceFile: SourceFile): boolean {
  const filePath: string = sourceFile.getFilePath();
  return TEST_FILE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

setDefaultTimeout(30000);

describe('analyzeProject - property redeclaration', () => {
  test('does not report properties as unused when structurally equivalent properties are used', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    // SourceOptions.timeout and retryCount should NOT be reported as unused
    // even though they're only accessed through ProcessedOptions and ConfigOptions
    const sourceTimeoutProps = results.unusedProperties.filter(
      (item) => item.typeName === 'SourceOptions' && item.propertyName === 'timeout'
    );
    const sourceRetryProps = results.unusedProperties.filter(
      (item) => item.typeName === 'SourceOptions' && item.propertyName === 'retryCount'
    );

    expect(sourceTimeoutProps).toHaveLength(0);
    expect(sourceRetryProps).toHaveLength(0);

    // But SourceOptions.unused SHOULD be reported as unused
    const sourceUnusedProps = results.unusedProperties.filter(
      (item) => item.typeName === 'SourceOptions' && item.propertyName === 'unused'
    );
    expect(sourceUnusedProps).toHaveLength(1);

    // ProcessedOptions properties should also NOT be reported as unused
    expect(results.unusedProperties.filter((item) => item.typeName === 'ProcessedOptions')).toHaveLength(0);

    // ConfigOptions.timeout and retryCount should NOT be reported as unused
    // because they're structurally equivalent to used properties
    const configTimeoutProps = results.unusedProperties.filter(
      (item) => item.typeName === 'ConfigOptions' && item.propertyName === 'timeout'
    );
    const configRetryProps = results.unusedProperties.filter(
      (item) => item.typeName === 'ConfigOptions' && item.propertyName === 'retryCount'
    );
    expect(configTimeoutProps).toHaveLength(0);
    expect(configRetryProps).toHaveLength(0);

    // But ConfigOptions.configSpecific SHOULD be reported as unused
    const configSpecificProps = results.unusedProperties.filter(
      (item) => item.typeName === 'ConfigOptions' && item.propertyName === 'configSpecific'
    );
    expect(configSpecificProps).toHaveLength(1);
  });
});
