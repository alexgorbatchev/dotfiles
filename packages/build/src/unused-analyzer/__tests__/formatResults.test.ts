import { describe, expect, test } from 'bun:test';
import { formatResults } from '../formatResults';
import type { AnalysisResults } from '../types';

describe('formatResults', () => {
  test('formats results with unused exports and properties', () => {
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
          exportName: 'UNUSED_CONSTANT',
          line: 20,
          character: 7,
          endCharacter: 22,
          kind: 'const',
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

    expect(output).toContain('Unused Exports:');
    expect(output).toContain('unusedFunction:10:1-15 [ERROR] (Unused function)');
    expect(output).toContain('UNUSED_CONSTANT:20:7-22 [ERROR] (Unused const)');
    expect(output).toContain('/path/to/file.ts');

    expect(output).toContain('Unused Type/Interface Properties:');
    expect(output).toContain('UserConfig.unusedProp:5:3-13 [ERROR] (Unused property)');
    expect(output).toContain('/path/to/types.ts');

    expect(output).toContain('Summary:');
    expect(output).toContain('Unused exports: 2');
    expect(output).toContain('Unused properties: 1');
  });

  test('formats results with no unused items', () => {
    const results: AnalysisResults = {
      unusedExports: [],
      unusedProperties: [],
    };

    const output = formatResults(results);

    expect(output).toContain('No unused exports or properties found!');
    expect(output).not.toContain('Unused Exports:');
    expect(output).not.toContain('Unused Type/Interface Properties:');
  });

  test('formats results with only unused exports', () => {
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
      unusedProperties: [],
    };

    const output = formatResults(results);

    expect(output).toContain('Unused Exports:');
    expect(output).not.toContain('Unused Type/Interface Properties:');
    expect(output).toContain('Summary:');
    expect(output).toContain('Unused exports: 1');
    expect(output).toContain('Unused properties: 0');
  });

  test('formats results with only unused properties', () => {
    const results: AnalysisResults = {
      unusedExports: [],
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

    expect(output).not.toContain('Unused Exports:');
    expect(output).toContain('Unused Type/Interface Properties:');
    expect(output).toContain('Summary:');
    expect(output).toContain('Unused exports: 0');
    expect(output).toContain('Unused properties: 1');
  });
});
