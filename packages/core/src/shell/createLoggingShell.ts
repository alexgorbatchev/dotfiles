import { createSafeLogMessage, type TsLogger } from '@dotfiles/logger';
import { type CommandBuilder, $ } from 'dax-sh';
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
      const command = typeof first === 'string' ? first : reconstructCommand(first, expressions);
      logger.info(createSafeLogMessage(`$ ${command}`));
      return createLoggingCommand(command, logger, defaultCwd);
    },
    $shell
  );

  Object.defineProperty(loggingShell, extendedShellBrand, { value: true, enumerable: false });
  return loggingShell as $extended;
}

/**
 * Creates a proxied dax command that logs output and preserves chaining.
 */
function createLoggingCommand(command: string, logger: TsLogger, cwd: string): ReturnType<$extended> {
  const stdoutCollector = createLoggingStream((line) => logger.info(createSafeLogMessage(`| ${line}`)));
  const stderrCollector = createLoggingStream((line) => logger.error(createSafeLogMessage(`| ${line}`)));

  // biome-ignore lint/suspicious/noExplicitAny: $.raw expects TemplateStringsArray, cast command string instead
  const daxCmd: CommandBuilder = $.raw(command as any).cwd(cwd).stdout(stdoutCollector.stream).stderr(stderrCollector.stream);

  const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
  // Strip trailing newline to match dax's native .text() behavior (e.g., `echo "hello"` returns "hello" not "hello\n")
  const trimmed = (bytes: Uint8Array): string => decode(bytes).replace(/\r?\n$/, '');

  const outputMethods: Record<string, (bytes: Uint8Array) => unknown> = {
    text: trimmed,
    json: (bytes) => JSON.parse(decode(bytes)),
    lines: (bytes) => trimmed(bytes).split('\n'),
    bytes: (bytes) => bytes,
    blob: (bytes) => new Blob([new Uint8Array(bytes)]),
    arrayBuffer: (bytes) => new Uint8Array(bytes).buffer,
  };

  const wrapWithProxy = (cmd: CommandBuilder): CommandBuilder => {
    return new Proxy(cmd, {
      get(target, prop) {
        const transform = outputMethods[String(prop)];
        if (transform) {
          return async () => {
            await target;
            return transform(stdoutCollector.getBytes());
          };
        }

        const value = Reflect.get(target, prop);

        // Wrap methods that return CommandBuilder to preserve proxy
        if (typeof value === 'function') {
          return (...args: unknown[]) => {
            const result = value.apply(target, args);
            if (result && typeof result === 'object' && 'text' in result) {
              return wrapWithProxy(result as CommandBuilder);
            }
            return result;
          };
        }

        return value;
      }
    });
  };

  return wrapWithProxy(daxCmd) as unknown as ReturnType<$extended>;
}

interface LoggingStreamCollector {
  stream: WritableStream<Uint8Array>;
  getBytes: () => Uint8Array;
}

/**
 * Creates a WritableStream that logs each line and collects all bytes.
 */
function createLoggingStream(logFn: (line: string) => void): LoggingStreamCollector {
  const chunks: Uint8Array[] = [];
  let buffer = '';

  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk);
      buffer += new TextDecoder().decode(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line) logFn(line);
      }
    },
    close() {
      if (buffer) logFn(buffer);
    },
  });

  const getBytes = (): Uint8Array => {
    const totalLength = chunks.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of chunks) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  };

  return { stream, getBytes };
}

/**
 * Reconstructs the command string from template literal parts.
 */
function reconstructCommand(strings: TemplateStringsArray, expressions: unknown[]): string {
  let command = strings[0] || '';
  for (let i = 0; i < expressions.length; i++) {
    const expression = expressions[i];
    if (Array.isArray(expression)) {
      command += (expression as unknown[]).join(' ');
    } else {
      command += String(expression);
    }
    command += strings[i + 1] || '';
  }
  return command;
}
