import { describe, expect, test } from 'bun:test';
import { formatResults } from '../formatResults';
import type { AnalysisResults } from '../types';

describe('Severity system', () => {
  test('shows [ERROR] for completely unused items', () => {
    const results: AnalysisResults = {
      unusedExports: [
        {
          filePath: '/path/to/file.ts',
          exportName: 'unusedFunction',
          line: 10,
          character: 1,
          endCharacter: 15,
          kind: 'function',
          severity: 'error',
          onlyUsedInTests: false,
        },
      ],
      unusedProperties: [
        {
          filePath: '/path/to/types.ts',
          typeName: 'UserConfig',
          propertyName: 'unusedProp',
          line: 5,
          character: 3,
          endCharacter: 13,
          severity: 'error',
          onlyUsedInTests: false,
        },
      ],
    };

    const output = formatResults(results);

    expect(output).toContain('unusedFunction:10:1-15 [ERROR] (Unused function)');
    expect(output).toContain('UserConfig.unusedProp:5:3-13 [ERROR] (Unused property)');
  });

  test('shows [WARNING] for items with TODO comments', () => {
    const results: AnalysisResults = {
      unusedExports: [],
      unusedProperties: [
        {
          filePath: '/path/to/types.ts',
          typeName: 'UserConfig',
          propertyName: 'todoProp',
          line: 15,
          character: 3,
          endCharacter: 11,
          severity: 'warning',
          onlyUsedInTests: false,
          todoComment: 'implement this later',
        },
      ],
    };

    const output = formatResults(results);

    expect(output).toContain('UserConfig.todoProp:15:3-11 [WARNING] (Unused property: [TODO] implement this later)');
  });

  test('shows [INFO] for test-only items', () => {
    const results: AnalysisResults = {
      unusedExports: [
        {
          filePath: '/path/to/helpers.ts',
          exportName: 'createTestUser',
          line: 8,
          character: 1,
          endCharacter: 15,
          kind: 'function',
          severity: 'info',
          onlyUsedInTests: true,
        },
      ],
      unusedProperties: [
        {
          filePath: '/path/to/types.ts',
          typeName: 'TestConfig',
          propertyName: 'testOnlyProp',
          line: 20,
          character: 3,
          endCharacter: 15,
          severity: 'info',
          onlyUsedInTests: true,
        },
      ],
    };

    const output = formatResults(results);

    expect(output).toContain('createTestUser:8:1-15 [INFO] (Used only in tests)');
    expect(output).toContain('TestConfig.testOnlyProp:20:3-15 [INFO] (Used only in tests)');
  });

  test('handles mixed severity levels', () => {
    const results: AnalysisResults = {
      unusedExports: [
        {
          filePath: '/path/to/file.ts',
          exportName: 'unusedFunction',
          line: 10,
          character: 1,
          endCharacter: 15,
          kind: 'function',
          severity: 'error',
          onlyUsedInTests: false,
        },
        {
          filePath: '/path/to/file.ts',
          exportName: 'testHelper',
          line: 20,
          character: 1,
          endCharacter: 11,
          kind: 'function',
          severity: 'info',
          onlyUsedInTests: true,
        },
      ],
      unusedProperties: [
        {
          filePath: '/path/to/types.ts',
          typeName: 'Config',
          propertyName: 'unusedProp',
          line: 5,
          character: 3,
          endCharacter: 13,
          severity: 'error',
          onlyUsedInTests: false,
        },
        {
          filePath: '/path/to/types.ts',
          typeName: 'Config',
          propertyName: 'todoProp',
          line: 10,
          character: 3,
          endCharacter: 11,
          severity: 'warning',
          onlyUsedInTests: false,
          todoComment: 'add validation',
        },
      ],
    };

    const output = formatResults(results);

    expect(output).toContain('[ERROR]');
    expect(output).toContain('[WARNING]');
    expect(output).toContain('[INFO]');
    expect(output).toContain('unusedFunction:10:1-15 [ERROR] (Unused function)');
    expect(output).toContain('testHelper:20:1-11 [INFO] (Used only in tests)');
    expect(output).toContain('Config.unusedProp:5:3-13 [ERROR] (Unused property)');
    expect(output).toContain('Config.todoProp:10:3-11 [WARNING] (Unused property: [TODO] add validation)');
  });
});
