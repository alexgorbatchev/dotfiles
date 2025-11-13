import { describe, expect, setDefaultTimeout, test } from 'bun:test';
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

// This test suite analyzes the entire project which can take longer than the default 5s timeout
setDefaultTimeout(30000);

describe('analyzeProject', () => {
  test('finds unused exports', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    const unusedExportNames = results.unusedExports.map((item) => item.exportName);

    expect(unusedExportNames).toContain('unusedFunction');
    expect(unusedExportNames).toContain('UNUSED_CONSTANT');
    expect(unusedExportNames).toContain('UnusedInterface');
    expect(unusedExportNames).toContain('UnusedType');
    expect(unusedExportNames).toContain('UnusedClass');
    expect(unusedExportNames).toContain('unusedVariable');

    expect(unusedExportNames).not.toContain('usedFunction');
    expect(unusedExportNames).not.toContain('USED_CONSTANT');
    expect(unusedExportNames).not.toContain('UsedInterface');
    expect(unusedExportNames).not.toContain('UsedType');
    expect(unusedExportNames).not.toContain('UsedClass');
    expect(unusedExportNames).not.toContain('usedVariable');
  });

  test('finds unused properties in interfaces', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    const unusedProps = results.unusedProperties.filter((item) => item.typeName === 'UsedInterface');

    expect(unusedProps).toHaveLength(1);

    const firstProp = unusedProps[0];
    expect(firstProp).toBeDefined();
    expect(firstProp?.propertyName).toBe('unusedProperty');
    expect(firstProp?.typeName).toBe('UsedInterface');
  });

  test('finds unused properties in type aliases', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    const unusedProps = results.unusedProperties.filter((item) => item.typeName === 'UsedType');

    expect(unusedProps).toHaveLength(1);

    const firstProp = unusedProps[0];
    expect(firstProp).toBeDefined();
    expect(firstProp?.propertyName).toBe('unusedField');
    expect(firstProp?.typeName).toBe('UsedType');
  });

  test('does not report used properties as unused', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    const usedInterfaceProps = results.unusedProperties.filter(
      (item) => item.typeName === 'UsedInterface' && item.propertyName === 'usedProperty'
    );

    const usedTypeProps = results.unusedProperties.filter(
      (item) => item.typeName === 'UsedType' && item.propertyName === 'usedField'
    );

    expect(usedInterfaceProps).toHaveLength(0);
    expect(usedTypeProps).toHaveLength(0);
  });

  test('includes file paths and line numbers', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    expect(results.unusedExports.length).toBeGreaterThan(0);
    expect(results.unusedProperties.length).toBeGreaterThan(0);

    const sampleExport = results.unusedExports.find((item) => item.filePath.includes('sample.ts'));
    expect(sampleExport).toBeDefined();
    expect(sampleExport?.line).toBeGreaterThan(0);

    const sampleProperty = results.unusedProperties.find((item) => item.filePath.includes('sample.ts'));
    expect(sampleProperty).toBeDefined();
    expect(sampleProperty?.line).toBeGreaterThan(0);
  });

  test('does not report re-exported symbols, only original definitions', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    // The originalFunction and ORIGINAL_CONSTANT are re-exported in reexport.ts
    // They should only be reported once in original.ts (if unused), not in both files

    const allExports = results.unusedExports;

    // Count how many times each export name appears
    const exportCounts = new Map<string, number>();
    for (const exp of allExports) {
      const count: number = exportCounts.get(exp.exportName) ?? 0;
      exportCounts.set(exp.exportName, count + 1);
    }

    // No export should appear more than once
    for (const [, count] of exportCounts.entries()) {
      expect(count).toBe(1);
    }

    // If original exports are unused, they should only appear in original.ts, not reexport.ts
    const originalFunctionInReexport = results.unusedExports.find(
      (item) => item.exportName === 'originalFunction' && item.filePath.includes('reexport.ts')
    );
    const originalConstantInReexport = results.unusedExports.find(
      (item) => item.exportName === 'ORIGINAL_CONSTANT' && item.filePath.includes('reexport.ts')
    );

    expect(originalFunctionInReexport).toBeUndefined();
    expect(originalConstantInReexport).toBeUndefined();
  });

  test('excludes files with @ts-nocheck on first line', () => {
    const results = analyzeProject(TSCONFIG_PATH, undefined, undefined, isTestFileForTests);

    // nocheck.ts has unused exports but should be excluded because it has @ts-nocheck
    const nocheckExports = results.unusedExports.filter((item) => item.filePath.includes('nocheck.ts'));

    expect(nocheckExports).toHaveLength(0);
  });
});
