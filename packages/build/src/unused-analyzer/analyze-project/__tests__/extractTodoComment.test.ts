import { describe, expect, test } from 'bun:test';
import { Node, Project } from 'ts-morph';
import { extractTodoComment } from '../extractTodoComment';

describe('extractTodoComment', () => {
  test('extracts single-line TODO comment', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  // TODO implement this feature
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];
    expect(prop).toBeDefined();

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('implement this feature');
  });

  test('extracts TODO comment with extra spaces', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  //   TODO   this has extra spaces
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('this has extra spaces');
  });

  test('extracts multi-line TODO comment', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  /* TODO this is a
     multi-line comment */
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('this is a multi-line comment');
  });

  test('extracts JSDoc-style TODO comment', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  /** TODO document this property */
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('document this property');
  });

  test('returns undefined when no TODO comment exists', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  // Regular comment
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBeUndefined();
  });

  test('returns undefined when property has no comments', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBeUndefined();
  });

  test('handles TODO in lowercase', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  // todo implement this
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('implement this');
  });

  test('handles TODO with mixed case', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  // Todo implement this
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('implement this');
  });

  test('extracts TODO from first comment when multiple comments exist', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface TestInterface {
  // TODO first todo
  // Another comment
  prop: string;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const prop = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(prop!);

    expect(result).toBe('first todo');
  });

  test('works with type aliases', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export type TestType = {
  // TODO implement this property
  prop: string;
};`
    );

    const typeAlias = sourceFile.getTypeAliases()[0];
    const typeNode = typeAlias?.getTypeNode();

    // Get the type literal and its members
    if (typeNode && Node.isTypeLiteral(typeNode)) {
      const members = typeNode.getMembers();
      const prop = members?.[0];

      expect(prop).toBeDefined();
      expect(Node.isPropertySignature(prop!)).toBe(true);

      if (Node.isPropertySignature(prop!)) {
        const result: string | undefined = extractTodoComment(prop);

        expect(result).toBe('implement this property');
      }
    } else {
      throw new Error('Expected type literal');
    }
  });

  test('extracts real-world TODO comment', () => {
    const project: Project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `export interface UpdateCommandSpecificOptions {
  // TODO --yes is not yet implemented
  yes: boolean;
  shimMode: boolean;
}`
    );

    const iface = sourceFile.getInterfaces()[0];
    const yesProp = iface?.getProperties()[0];

    const result: string | undefined = extractTodoComment(yesProp!);

    expect(result).toBe('--yes is not yet implemented');
  });
});
