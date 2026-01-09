import { createSafeLogMessage, type TsLogger } from '@dotfiles/logger';
import { $ } from 'dax-sh';
import { extendedShellBrand, type $extended } from './extendedShell.types';

interface LoggingShellOptions {
  cwd?: string;
}

/**
 * Creates a shell wrapper that logs executed commands and their output.
 *
 * Command logging format:
 * - Commands are logged as `$ command` at info level
 * - Stdout lines are logged as `| line` at info level
 * - Stderr lines are logged as `| line` at error level
 *
 * Output is streamed in real-time, preserving the interleaved order of stdout/stderr.
 *
 * @param $shell - The base shell instance to wrap
 * @param logger - Logger instance for command/output logging
 * @param options - Optional configuration including default cwd
 * @returns A new shell instance that logs commands and output
 *
 * @example
 * ```typescript
 * const loggingShell = createLoggingShell($, logger);
 * await loggingShell`echo hello`;
 * // Logs: $ echo hello
 * // Logs: | hello
 * ```
 */
export function createLoggingShell($shell: typeof $ | $extended, logger: TsLogger, options?: LoggingShellOptions): $extended {
  const defaultCwd = options?.cwd ?? process.cwd();

  const loggingShell = Object.assign(
    (first: TemplateStringsArray | string, ...expressions: unknown[]) => {
      // Reconstruct the command string from the template literal
      const command = typeof first === 'string' ? first : reconstructCommand(first, expressions);

      // Log the command before execution
      logger.info(createSafeLogMessage(`$ ${command}`));

      // Create a deferred execution that captures cwd/env from chaining
      return createDeferredExecution(command, logger, defaultCwd, process.env as Record<string, string>);
    },
    $shell
  );

  // Add the brand symbol to mark this as an extended shell
  Object.defineProperty(loggingShell, extendedShellBrand, { value: true, enumerable: false });

  return loggingShell as $extended;
}

interface SpawnConfig {
  cwd: string;
  env: Record<string, string>;
  shouldThrow: boolean;
}

/**
 * Creates a deferred execution object that captures cwd/env settings and executes on await.
 */
function createDeferredExecution(
  command: string,
  logger: TsLogger,
  initialCwd: string,
  initialEnv: Record<string, string>
): ReturnType<$extended> {
  const config: SpawnConfig = {
    cwd: initialCwd,
    env: { ...initialEnv },
    shouldThrow: true,
  };

  let executionPromise: Promise<{ exitCode: number; stdout: Buffer; stderr: Buffer }> | null = null;

  const executeIfNeeded = (): Promise<{ exitCode: number; stdout: Buffer; stderr: Buffer }> => {
    if (!executionPromise) {
      executionPromise = executeCommand(command, config, logger);
    }
    return executionPromise;
  };

  // Create a lazy promise that only executes when .then() is called
  const lazyPromise = {
    // biome-ignore lint/suspicious/noThenProperty: Required for lazy promise pattern - defers execution until awaited
    then<TResult1 = ShellResult, TResult2 = never>(
      onfulfilled?: ((value: ShellResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return executeIfNeeded()
        .then((result): ShellResult => {
          const resultLines = result.stdout.toString().split('\n');
          const stdoutText = result.stdout.toString();
          const stderrText = result.stderr.toString();
          return {
            code: result.exitCode,
            stdoutBytes: new Uint8Array(result.stdout),
            stderrBytes: new Uint8Array(result.stderr),
            get stdout() { return stdoutText; },
            get stderr() { return stderrText; },
            get combined() { return stdoutText + stderrText; }, // simplified
            text: () => stdoutText,
            json: () => JSON.parse(stdoutText),
            blob: () => new Blob([new Uint8Array(result.stdout)]),
            arrayBuffer: () => new Uint8Array(result.stdout).buffer as ArrayBuffer,
            bytes: () => new Uint8Array(result.stdout),
            lines: (): AsyncIterable<string> => ({
              [Symbol.asyncIterator]: () => {
                let index = 0;
                return {
                  async next(): Promise<IteratorResult<string>> {
                    if (index >= resultLines.length) {
                      return { done: true, value: undefined };
                    }
                    const value = resultLines[index];
                    index++;
                    return { done: false, value: value ?? '' };
                  },
                };
              },
            }),
          } as unknown as ShellResult;
        })
        .then(onfulfilled, onrejected);
    },
    catch<TResult = never>(
      onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
    ): Promise<ShellResult | TResult> {
      return this.then(undefined, onrejected);
    },
    finally(onfinally?: (() => void) | null): Promise<ShellResult> {
      return this.then(
        (value) => {
          onfinally?.();
          return value;
        },
        (reason) => {
          onfinally?.();
          throw reason;
        }
      );
    },
    [Symbol.toStringTag]: 'Promise' as const,
  };

  // Add shell-like chainable methods
  const enhanced = Object.assign(lazyPromise, {
    quiet: () => enhanced,
    nothrow: () => {
      config.shouldThrow = false;
      return enhanced;
    },
    noThrow: (value?: boolean) => {
      config.shouldThrow = value === false;
      return enhanced;
    },
    cwd: (newCwd: string) => {
      config.cwd = newCwd;
      return enhanced;
    },
    env: (newEnv: Record<string, string>) => {
      config.env = { ...config.env, ...newEnv };
      return enhanced;
    },
    throws: (shouldThrow: boolean) => {
      config.shouldThrow = shouldThrow;
      return enhanced;
    },
    text: () => executeIfNeeded().then((r) => r.stdout.toString()),
    json: () => executeIfNeeded().then((r) => JSON.parse(r.stdout.toString())),
    blob: () => executeIfNeeded().then((r) => new Blob([new Uint8Array(r.stdout)])),
    arrayBuffer: () => executeIfNeeded().then((r) => new Uint8Array(r.stdout).buffer as ArrayBuffer),
    bytes: () => executeIfNeeded().then((r) => new Uint8Array(r.stdout)),
    lines: (): AsyncIterable<string> => ({
      [Symbol.asyncIterator]: () => {
        let resultLines: string[] | null = null;
        let index = 0;
        return {
          async next(): Promise<IteratorResult<string>> {
            if (!resultLines) {
              const result = await executeIfNeeded();
              resultLines = result.stdout.toString().split('\n');
            }
            if (index >= resultLines.length) {
              return { done: true, value: undefined };
            }
            const value = resultLines[index];
            index++;
            return { done: false, value: value ?? '' };
          },
        };
      },
    }),
    kill: () => {
      /* no-op for compatibility */
    },
  });

  // Add stdin stub using defineProperty to avoid getter triggering during Object.assign
  Object.defineProperty(enhanced, 'stdin', {
    get(): WritableStream {
      throw new Error('stdin is not supported for logging shell');
    },
    enumerable: false,
    configurable: false,
  });

  return enhanced as unknown as ReturnType<$extended>;
}

interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
  stdoutBytes: Uint8Array;
  stderrBytes: Uint8Array;
  // Compat methods
  text: () => string;
  json: () => unknown;
  blob: () => Blob;
  arrayBuffer: () => ArrayBuffer;
  bytes: () => Uint8Array;
  lines: () => AsyncIterable<string>;
}

/**
 * Executes the command using spawn with streaming output.
 */
async function executeCommand(
  command: string,
  config: SpawnConfig,
  logger: TsLogger
): Promise<{ exitCode: number; code: number; stdout: Buffer; stderr: Buffer }> {
  // Use dax-sh to spawn the command
  // biome-ignore lint/suspicious/noExplicitAny: dax internals
  const child = ($.raw as any)(command)
    .cwd(config.cwd)
    .env(config.env)
    .stdout('piped')
    .stderr('piped')
    .noThrow()
    .spawn();

  const proc = {
    stdout: child.stdout(),
    stderr: child.stderr(),
    // biome-ignore lint/suspicious/noExplicitAny: dax internals
    exited: child.then((r: any) => r.code),
  };

  return streamOutputAndWait(proc, logger, config.shouldThrow, command);
}

interface StreamResult {
  source: 'stdout' | 'stderr';
  done: boolean;
  value?: Uint8Array;
}

interface ReadResult {
  done: boolean;
  value?: Uint8Array;
}

interface StreamState {
  chunks: Uint8Array[];
  buffer: string;
  done: boolean;
  pending: Promise<StreamResult> | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
}

function createStreamState(reader: ReadableStreamDefaultReader<Uint8Array> | null): StreamState {
  return {
    chunks: [],
    buffer: '',
    done: !reader,
    pending: null,
    reader,
  };
}

function createReadPromise(
  state: StreamState,
  source: 'stdout' | 'stderr'
): Promise<StreamResult> | null {
  if (state.done || !state.reader) return null;
  return state.reader.read().then((result: ReadResult): StreamResult => ({
    source,
    done: result.done,
    value: result.value,
  }));
}

function processStreamResult(
  state: StreamState,
  result: StreamResult,
  logFn: (message: string) => void
): void {
  if (result.done) {
    state.done = true;
    if (state.buffer) {
      logFn(`| ${state.buffer}`);
    }
    return;
  }

  if (result.value) {
    state.chunks.push(result.value);
    state.buffer += new TextDecoder().decode(result.value);
    const lines = state.buffer.split('\n');
    state.buffer = lines.pop() || '';
    for (const line of lines) {
      if (line) logFn(`| ${line}`);
    }
  }
}

/**
 * Streams stdout and stderr in real-time, logging each line as it arrives.
 * Uses concurrent reading with proper tracking to interleave output.
 */
async function streamOutputAndWait(
  proc: { stdout: ReadableStream | null; stderr: ReadableStream | null; exited: Promise<number> },
  logger: TsLogger,
  shouldThrow: boolean,
  command: string
): Promise<{ exitCode: number; code: number; stdout: Buffer; stderr: Buffer }> {
  // Get readers if stdout/stderr are ReadableStream (not number)
  const stdoutStream = proc.stdout;
  const stderrStream = proc.stderr;

  const stdout = createStreamState(stdoutStream?.getReader() as ReadableStreamDefaultReader<Uint8Array> ?? null);
  const stderr = createStreamState(stderrStream?.getReader() as ReadableStreamDefaultReader<Uint8Array> ?? null);

  // Start initial reads
  stdout.pending = createReadPromise(stdout, 'stdout');
  stderr.pending = createReadPromise(stderr, 'stderr');

  // Read from both streams using Promise.race to interleave output
  await processStreamsAndWait(stdout, stderr, logger);

  const exitCode = await proc.exited;
  const stdoutBuffer = Buffer.concat(stdout.chunks);
  const stderrBuffer = Buffer.concat(stderr.chunks);

  await handleExit(exitCode, stdoutBuffer, stderrBuffer, shouldThrow, command);

  return { 
    exitCode, 
    code: exitCode, 
    stdout: stdoutBuffer, 
    stderr: stderrBuffer 
  };
}

async function processStreamsAndWait(
  stdout: StreamState,
  stderr: StreamState,
  logger: TsLogger
): Promise<void> {
  while (!stdout.done || !stderr.done) {
    const promises: Promise<StreamResult>[] = [];

    if (stdout.pending) promises.push(stdout.pending);
    if (stderr.pending) promises.push(stderr.pending);

    if (promises.length === 0) break;

    const result = await Promise.race(promises);
    const isStdout = result.source === 'stdout';
    const state = isStdout ? stdout : stderr;
    const logFn = isStdout
      ? (msg: string) => logger.info(createSafeLogMessage(msg))
      : (msg: string) => logger.error(createSafeLogMessage(msg));

    state.pending = null;
    processStreamResult(state, result, logFn);

    if (!result.done) {
      state.pending = createReadPromise(state, result.source);
    }
  }
}

async function handleExit(
  exitCode: number,
  stdoutBuffer: Buffer,
  stderrBuffer: Buffer,
  shouldThrow: boolean,
  command: string
): Promise<void> {
  if (shouldThrow && exitCode !== 0) {
    let errorMessage = `Command failed: ${command}`;
    const stderrString = stderrBuffer.toString().trim();
    if (stderrString) {
      errorMessage += `\n${stderrString}`;
    }
    const error = new Error(errorMessage);
    (error as Error & { exitCode: number }).exitCode = exitCode;
    Object.assign(error, { stdout: stdoutBuffer, stderr: stderrBuffer });
    throw error;
  }
}

/**
 * Reconstructs the command string from template literal parts.
 * Handles arrays by joining with spaces (shell-style expansion).
 */
function reconstructCommand(strings: TemplateStringsArray, expressions: unknown[]): string {
  let command = strings[0] || '';
  for (let i = 0; i < expressions.length; i++) {
    const expression = expressions[i];
    // Handle arrays by joining with spaces
    if (Array.isArray(expression)) {
      command += (expression as unknown[]).join(' ');
    } else {
      command += String(expression);
    }
    command += strings[i + 1] || '';
  }
  return command;
}
