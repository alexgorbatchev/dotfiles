import { describe, expect, it } from 'bun:test';
import { extractToolFileLocations, formatErrorForUser, isError } from '../filterErrorStack';

describe('extractToolFileLocations', () => {
  it('returns empty array for undefined stack', () => {
    expect(extractToolFileLocations(undefined)).toEqual([]);
  });

  it('returns empty array for empty stack', () => {
    expect(extractToolFileLocations('')).toEqual([]);
  });

  it('returns empty array when no .tool.ts frames exist', () => {
    const stack = `Error: Something went wrong
    at someFunction (/path/to/file.ts:10:5)
    at anotherFunction (/path/to/other.ts:20:10)`;

    expect(extractToolFileLocations(stack)).toEqual([]);
  });

  it('extracts filename:line from .tool.ts frame', () => {
    const stack = `Error: Something went wrong
    at someFunction (/path/to/file.ts:10:5)
    at hook (/path/to/navi.tool.ts:14:13)
    at anotherFunction (/path/to/other.ts:20:10)`;

    expect(extractToolFileLocations(stack)).toEqual(['navi.tool.ts:14']);
  });

  it('handles .tool.js files', () => {
    const stack = `Error: Something went wrong
    at someFunction (/path/to/file.js:10:5)
    at hook (/path/to/navi.tool.js:14:13)`;

    expect(extractToolFileLocations(stack)).toEqual(['navi.tool.js:14']);
  });

  it('extracts multiple .tool.ts locations', () => {
    const stack = `Error: Something went wrong
    at someFunction (/path/to/file.ts:10:5)
    at firstHook (/path/to/navi.tool.ts:14:13)
    at internal (/path/to/other.ts:20:10)
    at secondHook (/path/to/flux.tool.ts:8:3)`;

    expect(extractToolFileLocations(stack)).toEqual(['navi.tool.ts:14', 'flux.tool.ts:8']);
  });
});

describe('formatErrorForUser', () => {
  it('returns formatted location for error with .tool.ts frame', () => {
    const error = new Error('Test error');
    error.stack = `Error: Test error
    at someFunction (/path/to/file.ts:10:5)
    at hook (/path/to/flux.tool.ts:14:13)`;

    expect(formatErrorForUser(error)).toBe('(flux.tool.ts:14)');
  });

  it('returns null for error without .tool.ts frames', () => {
    const error = new Error('Test error');
    error.stack = `Error: Test error
    at someFunction (/path/to/file.ts:10:5)
    at anotherFunction (/path/to/other.ts:20:10)`;

    expect(formatErrorForUser(error)).toBeNull();
  });

  it('formats multiple .tool.ts locations', () => {
    const error = new Error('Test error');
    error.stack = `Error: Test error
    at firstHook (/path/to/navi.tool.ts:14:13)
    at secondHook (/path/to/flux.tool.ts:8:3)`;

    expect(formatErrorForUser(error)).toBe('(navi.tool.ts:14, flux.tool.ts:8)');
  });

  it('returns null for error with undefined stack', () => {
    const error = new Error('No stack');
    error.stack = undefined;

    expect(formatErrorForUser(error)).toBeNull();
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
