import { beforeEach, describe, expect, it } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import { $ } from 'dax-sh';
import { createLoggingShell } from '../createLoggingShell';
import type { $extended } from '../extendedShell.types';

describe('createLoggingShell', () => {
  let logger: TestLogger;
  let loggingShell: $extended;

  beforeEach(() => {
    logger = new TestLogger({ name: 'ShellTest' });
    loggingShell = createLoggingShell($ as $extended, logger);
  });

  it('logs the command before execution', async () => {
    await loggingShell`echo hello`.quiet();

    // Check that command was logged
    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo hello', '| hello']);
  });

  it('logs stdout output as info', async () => {
    await loggingShell`echo "hello world"`.quiet();

    // Check command and output logs
    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo "hello world"', '| hello world']);
  });

  it('logs stderr output as error', async () => {
    // Use a command that writes to stderr
    await loggingShell`sh -c "echo error-message >&2"`.quiet();

    // Check that stderr was logged as error
    logger.expect(['ERROR'], ['ShellTest'], [], ['| error-message']);
  });

  it('logs multiple stdout lines separately', async () => {
    await loggingShell`printf "line1\nline2\nline3"`.quiet();

    // The command is also logged (with embedded newlines) but we skip matching it
    // and just verify the output lines are logged separately
    const outputLogs = logger.logs.filter((log) => {
      const firstArg: unknown = log[0];
      return typeof firstArg === 'string' && firstArg.startsWith('|');
    });
    expect(outputLogs.length).toBe(3);
  });

  it('preserves shell chaining with .cwd()', async () => {
    await loggingShell`pwd`.cwd('/tmp').quiet();

    // On macOS, /tmp is a symlink to /private/tmp
    logger.expect(['INFO'], ['ShellTest'], [], ['$ pwd', /\| (\/(private\/)?tmp)/]);
  });

  it('preserves shell chaining with .env()', async () => {
    await loggingShell`echo $TEST_VAR`.env({ TEST_VAR: 'test-value' }).quiet();

    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo $TEST_VAR', '| test-value']);
  });

  it('works with .text() result method', async () => {
    const result = await loggingShell`echo "text output"`.text();

    expect(result.trim()).toBe('text output');
    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo "text output"', '| text output']);
  });

  it('works with .json() result method', async () => {
    const result = await loggingShell`echo '{"key":"value"}'`.json();

    expect(result).toEqual({ key: 'value' });
    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo \'{"key":"value"}\'', '| {"key":"value"}']);
  });

  it('works with .lines() result method', async () => {
    const result = await loggingShell`printf "line1\nline2\nline3"`.lines();

    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  it('works with .bytes() result method', async () => {
    const result = await loggingShell`echo "bytes"`.bytes();

    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result).trim()).toBe('bytes');
  });

  it('works with .blob() result method', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: blob() exists on CommandBuilder but not in TS types
    const result = await (loggingShell`echo "blob"` as any).blob();

    expect(result).toBeInstanceOf(Blob);
    const text = await result.text();
    expect(text.trim()).toBe('blob');
  });

  it('works with .arrayBuffer() result method', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: arrayBuffer() exists on CommandBuilder but not in TS types
    const result = await (loggingShell`echo "buffer"` as any).arrayBuffer();

    expect(result).toBeInstanceOf(ArrayBuffer);
    const text = new TextDecoder().decode(result);
    expect(text.trim()).toBe('buffer');
  });

  it('handles template expressions correctly', async () => {
    const name = 'world';
    await loggingShell`echo hello ${name}`.quiet();

    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo hello world', '| hello world']);
  });

  it('handles array expressions in template', async () => {
    const args: string[] = ['arg1', 'arg2', 'arg3'];
    await loggingShell`echo ${args}`.quiet();

    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo arg1 arg2 arg3', '| arg1 arg2 arg3']);
  });

  it('does not log empty stdout', async () => {
    // Use a command that produces no output
    await loggingShell`true`.quiet();

    // Only the command should be logged, no output lines
    const outputLogs = logger.logs.filter((log) => {
      const firstArg: unknown = log[0];
      return typeof firstArg === 'string' && firstArg.startsWith('|');
    });
    expect(outputLogs.length).toBe(0);
  });

  it('handles commands with both stdout and stderr', async () => {
    await loggingShell`sh -c "echo stdout-line && echo stderr-line >&2"`.quiet();

    // Check INFO logs contain the command and stdout
    const stdoutLog = logger.logs.find((log) => {
      const firstArg: unknown = log[0];
      return typeof firstArg === 'string' && firstArg.includes('| stdout-line');
    });
    expect(stdoutLog).toBeDefined();

    // Check ERROR logs contain stderr
    const stderrLog = logger.logs.find((log) => {
      const firstArg: unknown = log[0];
      const isError = log['_meta']?.logLevelName === 'ERROR';
      return isError && typeof firstArg === 'string' && firstArg.includes('| stderr-line');
    });
    expect(stderrLog).toBeDefined();
  });

  it('automatically suppresses direct stdout to avoid duplicate output', async () => {
    // When using the logging shell without .quiet(), output should NOT appear
    // directly on stdout - it should ONLY appear via the logger with | prefix.
    // This prevents duplicate output like:
    //   INFO [tool] $ echo hello
    //   hello                      <-- direct stdout (unwanted)
    //   INFO [tool] | hello        <-- logged output (wanted)

    // Execute without .quiet() - the logging shell should handle suppression internally
    await loggingShell`echo "suppression-test"`;

    // Logger should have captured the output
    logger.expect(['INFO'], ['ShellTest'], [], ['$ echo "suppression-test"', '| suppression-test']);

    // The actual stdout suppression is verified by the e2e hook test which
    // checks that hook output doesn't appear duplicated in the CLI output.
  });
});
