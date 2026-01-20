import { createSafeLogMessage } from '@dotfiles/logger';
import { ShellError } from './ShellError';
import type { Shell, ShellCommand, ShellOptions, ShellResult } from './types';

/**
 * Creates a shell instance with optional default options.
 *
 * @example
 * ```typescript
 * const $ = createShell({ logger });
 * const result = await $`echo hello`;
 * const text = await $`cat file.txt`.cwd('/tmp').text();
 * ```
 */
export function createShell(defaultOptions: ShellOptions = {}): Shell {
  const shell: Shell = (first: TemplateStringsArray | string, ...values: unknown[]): ShellCommand => {
    const command = typeof first === 'string' ? first : reconstructCommand(first, values);
    return createShellCommand(command, defaultOptions);
  };
  return shell;
}

/**
 * Creates a shell command with chainable options.
 */
function createShellCommand(command: string, options: ShellOptions): ShellCommand {
  let currentOptions = { ...options };
  let executed = false;
  let resultPromise: Promise<ShellResult> | null = null;

  const execute = async (): Promise<ShellResult> => {
    if (resultPromise) return resultPromise;
    executed = true;

    resultPromise = executeCommand(command, currentOptions);
    return resultPromise;
  };

  const cmd: ShellCommand = {
    cwd(path: string): ShellCommand {
      if (executed) throw new Error('Cannot modify command after execution');
      currentOptions = { ...currentOptions, cwd: path };
      return cmd;
    },

    env(vars: Record<string, string | undefined>): ShellCommand {
      if (executed) throw new Error('Cannot modify command after execution');
      currentOptions = {
        ...currentOptions,
        env: { ...currentOptions.env, ...vars },
      };
      return cmd;
    },

    quiet(): ShellCommand {
      if (executed) throw new Error('Cannot modify command after execution');
      currentOptions = { ...currentOptions, quiet: true };
      return cmd;
    },

    noThrow(): ShellCommand {
      if (executed) throw new Error('Cannot modify command after execution');
      currentOptions = { ...currentOptions, noThrow: true };
      return cmd;
    },

    async text(): Promise<string> {
      const result = await execute();
      return result.stdout.replace(/\r?\n$/, '');
    },

    async json<T = unknown>(): Promise<T> {
      const result = await execute();
      return JSON.parse(result.stdout) as T;
    },

    async lines(): Promise<string[]> {
      const result = await execute();
      return result.stdout.replace(/\r?\n$/, '').split('\n');
    },

    async bytes(): Promise<Uint8Array> {
      const result = await execute();
      return new TextEncoder().encode(result.stdout);
    },

    // oxlint-disable-next-line unicorn/no-thenable -- Required for PromiseLike interface to enable await syntax
    then<TResult1 = ShellResult, TResult2 = never>(
      onfulfilled?: ((value: ShellResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return execute().then(onfulfilled, onrejected);
    },
  };

  return cmd;
}

/**
 * Executes a shell command using Bun.spawn with sh -c.
 * Streams output in real-time if logger is provided.
 *
 * Note: The `quiet` option is kept for API compatibility but does NOT suppress
 * logger output. If a logger is provided, it will always log. The purpose of
 * a logging shell is to log - calling .quiet() shouldn't defeat that purpose.
 */
async function executeCommand(command: string, options: ShellOptions): Promise<ShellResult> {
  const { cwd, env, logger, noThrow, skipCommandLog } = options;

  // Log the command (unless skipCommandLog is set - used when wrapper logs command)
  if (logger && !skipCommandLog) {
    logger.info(createSafeLogMessage(`$ ${command}`));
  }

  // Build environment - merge with process.env
  const mergedEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete mergedEnv[key];
      } else {
        mergedEnv[key] = value;
      }
    }
  }

  const proc = Bun.spawn(['sh', '-c', command], {
    cwd,
    env: mergedEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Collect output while streaming to logger (always logs if logger provided)
  const [stdout, stderr] = await Promise.all([
    collectStream(proc.stdout, logger ? (line: string) => logger.info(createSafeLogMessage(`| ${line}`)) : undefined),
    collectStream(proc.stderr, logger ? (line: string) => logger.error(createSafeLogMessage(`| ${line}`)) : undefined),
  ]);

  const code = await proc.exited;

  if (code !== 0 && !noThrow) {
    throw new ShellError(code, stdout, stderr, command);
  }

  return { code, stdout, stderr };
}

/**
 * Collects a readable stream into a string, optionally logging each line in real-time.
 */
async function collectStream(
  stream: ReadableStream<Uint8Array>,
  onLine?: (line: string) => void,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    chunks.push(text);

    if (onLine) {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line) onLine(line);
      }
    }
  }

  // Flush remaining buffer
  if (onLine && buffer) {
    onLine(buffer);
  }

  return chunks.join('');
}

/**
 * Reconstructs a command string from template literal parts.
 */
function reconstructCommand(strings: TemplateStringsArray, values: unknown[]): string {
  let command = strings[0] || '';
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (Array.isArray(value)) {
      command += value.map(escapeArg).join(' ');
    } else {
      command += escapeArg(value);
    }
    command += strings[i + 1] || '';
  }
  return command;
}

/**
 * Escapes a value for safe shell interpolation.
 */
function escapeArg(value: unknown): string {
  const str = String(value);
  // If already quoted or contains no special chars, return as-is
  if (/^[a-zA-Z0-9_\-./=:@]+$/.test(str)) {
    return str;
  }
  // Escape single quotes and wrap in single quotes
  return `'${str.replace(/'/g, "'\\''")}'`;
}
