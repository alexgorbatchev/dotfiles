import { describe, expect, test } from 'bun:test';
import { Project } from 'ts-morph';
import { hasNoCheck } from '../hasNoCheck';

describe('hasNoCheck', () => {
  test('returns true when first line is exactly "// @ts-nocheck"', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', '// @ts-nocheck\nexport const foo = 123;');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(true);
  });

  test('returns false when first line is not @ts-nocheck', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', 'export const foo = 123;');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(false);
  });

  test('returns false when @ts-nocheck is on second line', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', '// Some comment\n// @ts-nocheck\nexport const foo = 123;');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(false);
  });

  test('returns true when first line has whitespace before @ts-nocheck', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', '   // @ts-nocheck\nexport const foo = 123;');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(true);
  });

  test('returns true when first line has whitespace after @ts-nocheck', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', '// @ts-nocheck   \nexport const foo = 123;');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(true);
  });

  test('returns false when first line has text after @ts-nocheck', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', '// @ts-nocheck - some reason\nexport const foo = 123;');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(false);
  });

  test('returns false for empty file', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('test.ts', '');

    const result: boolean = hasNoCheck(sourceFile);

    expect(result).toBe(false);
  });
});
