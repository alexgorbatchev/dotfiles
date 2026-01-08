import { describe, expect, it } from 'bun:test';
import { extractErrorCause } from '../extractErrorCause';

describe('extractErrorCause', () => {
  describe('ShellError handling', () => {
    it('extracts stderr from ShellError', () => {
      const shellError = {
        name: 'ShellError',
        message: 'Command failed',
        exitCode: 1,
        stderr: 'bun: command not found: navi',
        stdout: '',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('bun: command not found: navi');
    });

    it('extracts stderr from Uint8Array', () => {
      const stderrBytes = new TextEncoder().encode('error from bytes');
      const shellError = {
        name: 'ShellError',
        message: 'Command failed',
        exitCode: 1,
        stderr: stderrBytes,
        stdout: '',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('error from bytes');
    });

    it('trims whitespace from stderr', () => {
      const shellError = {
        name: 'ShellError',
        message: 'Command failed',
        exitCode: 1,
        stderr: '  error with whitespace  \n',
        stdout: '',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('error with whitespace');
    });

    it('falls back to stdout when stderr is empty', () => {
      const shellError = {
        name: 'ShellError',
        message: 'Command failed',
        exitCode: 1,
        stderr: '',
        stdout: 'output from stdout',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('output from stdout');
    });

    it('falls back to message when both stderr and stdout are empty', () => {
      const shellError = {
        name: 'ShellError',
        message: 'Command failed with no output',
        exitCode: 1,
        stderr: '',
        stdout: '',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('Command failed with no output');
    });

    it('falls back to exit code when message is also empty', () => {
      const shellError = {
        name: 'ShellError',
        exitCode: 127,
        stderr: '',
        stdout: '',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('exit code 127');
    });

    it('handles unknown exit code', () => {
      const shellError = {
        name: 'ShellError',
        stderr: '',
        stdout: '',
      };

      const cause = extractErrorCause(shellError);

      expect(cause).toBe('exit code unknown');
    });
  });

  describe('regular Error handling', () => {
    it('extracts message from Error', () => {
      const error = new Error('Something went wrong');

      const cause = extractErrorCause(error);

      expect(cause).toBe('Something went wrong');
    });
  });

  describe('primitive handling', () => {
    it('converts string to cause', () => {
      const cause = extractErrorCause('string error');

      expect(cause).toBe('string error');
    });

    it('converts number to cause', () => {
      const cause = extractErrorCause(42);

      expect(cause).toBe('42');
    });

    it('converts null to cause', () => {
      const cause = extractErrorCause(null);

      expect(cause).toBe('null');
    });

    it('converts undefined to cause', () => {
      const cause = extractErrorCause(undefined);

      expect(cause).toBe('undefined');
    });
  });
});
