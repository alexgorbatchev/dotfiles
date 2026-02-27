import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BuildError, handleBuildError } from '../handleBuildError';

type ConsoleMethod = (...data: unknown[]) => void;
type ExitCodeValue = number | string | null | undefined;

describe('handleBuildError', () => {
  const originalConsoleError: ConsoleMethod = console.error;
  const originalExitCode: ExitCodeValue = process.exitCode;
  let loggedMessages: string[];

  beforeEach(() => {
    loggedMessages = [];
    console.error = (...messages: unknown[]): void => {
      const serializedMessage: string = messages.map((message: unknown) => String(message)).join(' ');
      loggedMessages.push(serializedMessage);
    };
    process.exitCode = undefined;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    process.exitCode = 0;
  });

  afterAll(() => {
    process.exitCode = typeof originalExitCode === 'number' ? originalExitCode : undefined;
  });

  test('logs build errors and sets exit code', async () => {
    const rootCause = new Error('schema failure');
    const buildError = new BuildError('Schema generation failed', rootCause);

    await handleBuildError(async () => {
      throw buildError;
    });

    expect(process.exitCode).toBe(1);
    expect(loggedMessages).toHaveLength(3);
    expect(loggedMessages[0]).toBe('Build failed');
    expect(loggedMessages[1]).toBe('Reason: Schema generation failed');
    expect(loggedMessages[2]).toEqual(expect.stringContaining('schema failure'));
  });

  test('logs unexpected errors and sets exit code', async () => {
    const unexpectedError = new Error('unexpected failure');

    await handleBuildError(async () => {
      throw unexpectedError;
    });

    expect(process.exitCode).toBe(1);
    expect(loggedMessages).toHaveLength(2);
    expect(loggedMessages[0]).toBe('Build failed unexpectedly');
    expect(loggedMessages[1]).toEqual(expect.stringContaining('unexpected failure'));
  });
});
