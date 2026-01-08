import { describe, expect, it } from 'bun:test';
import { filterErrorStackToToolFiles, filterStackToToolFiles, isError } from '../filterErrorStack';

describe('filterErrorStack', () => {
  describe('filterStackToToolFiles', () => {
    it('returns null for undefined stack', () => {
      const result = filterStackToToolFiles(undefined);
      expect(result).toBeNull();
    });

    it('returns null for empty stack', () => {
      const result = filterStackToToolFiles('');
      expect(result).toBeNull();
    });

    it('returns null when no .tool.ts frames exist', () => {
      const stack = `Error: Something went wrong
    at someFunction (/path/to/file.ts:10:5)
    at anotherFunction (/path/to/other.ts:20:10)`;

      const result = filterStackToToolFiles(stack);
      expect(result).toBeNull();
    });

    it('extracts first .tool.ts frame', () => {
      const stack = `Error: Something went wrong
    at someFunction (/path/to/file.ts:10:5)
    at hook (/path/to/navi.tool.ts:14:13)
    at anotherFunction (/path/to/other.ts:20:10)`;

      const result = filterStackToToolFiles(stack);
      expect(result).toBe('at hook (/path/to/navi.tool.ts:14:13)');
    });

    it('handles .tool.js files', () => {
      const stack = `Error: Something went wrong
    at someFunction (/path/to/file.js:10:5)
    at hook (/path/to/navi.tool.js:14:13)`;

      const result = filterStackToToolFiles(stack);
      expect(result).toBe('at hook (/path/to/navi.tool.js:14:13)');
    });
  });

  describe('filterErrorStackToToolFiles', () => {
    it('creates filtered error with .tool.ts frame', () => {
      const originalError = new Error('Test error');
      originalError.stack = `Error: Test error
    at someFunction (/path/to/file.ts:10:5)
    at hook (/path/to/test.tool.ts:14:13)
    at anotherFunction (/path/to/other.ts:20:10)`;

      const filtered = filterErrorStackToToolFiles(originalError);

      expect(filtered.name).toBe('Error');
      expect(filtered.message).toBe('Test error');
      expect(filtered.stack).toBe('Error: Test error\n    at hook (/path/to/test.tool.ts:14:13)');
    });

    it('creates error with no stack when no .tool.ts frames', () => {
      const originalError = new Error('Test error');
      originalError.stack = `Error: Test error
    at someFunction (/path/to/file.ts:10:5)
    at anotherFunction (/path/to/other.ts:20:10)`;

      const filtered = filterErrorStackToToolFiles(originalError);

      expect(filtered.name).toBe('Error');
      expect(filtered.message).toBe('Test error');
      expect(filtered.stack).toBe('Error: Test error');
    });

    it('preserves custom error name', () => {
      const originalError = new Error('Custom error');
      originalError.name = 'CustomError';
      originalError.stack = `CustomError: Custom error
    at hook (/path/to/test.tool.ts:14:13)`;

      const filtered = filterErrorStackToToolFiles(originalError);

      expect(filtered.name).toBe('CustomError');
      expect(filtered.message).toBe('Custom error');
    });

    it('handles error with undefined stack', () => {
      const originalError = new Error('No stack');
      originalError.stack = undefined;

      const filtered = filterErrorStackToToolFiles(originalError);

      expect(filtered.name).toBe('Error');
      expect(filtered.message).toBe('No stack');
      expect(filtered.stack).toBe('Error: No stack');
    });

    it('handles error with empty message but has tool frame', () => {
      // Create an object that looks like an error with empty message
      const originalError: Error = {
        name: 'Error',
        message: '',
        stack: `Error: 
    at hook (/path/to/test.tool.ts:14:13)`,
      } as Error;

      const filtered = filterErrorStackToToolFiles(originalError);

      expect(filtered.name).toBe('Error');
      expect(filtered.stack).toContain('at hook (/path/to/test.tool.ts:14:13)');
    });
  });

  describe('isError', () => {
    it('returns true for Error instance', () => {
      expect(isError(new Error('test'))).toBe(true);
    });

    it('returns true for TypeError instance', () => {
      expect(isError(new TypeError('test'))).toBe(true);
    });

    it('returns false for string', () => {
      expect(isError('error')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isError(undefined)).toBe(false);
    });

    it('returns false for plain object', () => {
      expect(isError({ message: 'error' })).toBe(false);
    });
  });
});
