import { createSafeLogMessage, type TsLogger } from '@dotfiles/logger';
import { type $, type CommandBuilder } from 'dax-sh';
import { type $extended, extendedShellBrand, loggingShellBrand } from './extendedShell.types';

type BaseShell = typeof $ | $extended;

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
export function createLoggingShell(
  $shell: BaseShell,
  logger: TsLogger,
  _options?: LoggingShellOptions,
): $extended {
  const loggingShell = Object.assign((first: TemplateStringsArray | string, ...expressions: unknown[]) => {
    const command = typeof first === 'string' ? first : reconstructCommand(first, expressions);
    logger.info(createSafeLogMessage(`$ ${command}`));
    return createLoggingCommand($shell, first, expressions, logger);
  }, $shell);

  Object.defineProperty(loggingShell, extendedShellBrand, { value: true, enumerable: false });
  Object.defineProperty(loggingShell, loggingShellBrand, { value: true, enumerable: false });
  return loggingShell as $extended;
}

/**
 * Creates a proxied dax command that logs output and preserves chaining.
 * Invokes the wrapped shell using template literal syntax to preserve custom shell behavior.
 */
function createLoggingCommand(
  $shell: BaseShell,
  first: TemplateStringsArray | string,
  expressions: unknown[],
  logger: TsLogger,
): ReturnType<$extended> {
  const stdoutCollector = createLoggingStream((line) => logger.info(createSafeLogMessage(`| ${line}`)));
  const stderrCollector = createLoggingStream((line) => logger.error(createSafeLogMessage(`| ${line}`)));

  // Invoke the wrapped shell using template literal syntax to preserve custom shell behavior
  // (e.g., cwd, env modifications from createToolConfigCwdShell or createShellWithEnhancedPath)
  let daxCmd: CommandBuilder;
  if (typeof first === 'string') {
    daxCmd = ($shell as $extended)(first) as unknown as CommandBuilder;
  } else {
    // @ts-expect-error: dax-sh typing for template expressions
    daxCmd = $shell(first, ...expressions) as unknown as CommandBuilder;
  }

  // IMPORTANT: Attach streams EAGERLY before any chaining.
  // dax-sh's chaining methods (.quiet(), .cwd(), .env()) preserve streams set BEFORE them,
  // but don't respect streams set AFTER. So we must attach streams immediately.
  daxCmd = daxCmd.stdout(stdoutCollector.stream).stderr(stderrCollector.stream);

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

  /**
   * Enhances a dax shell error with captured stderr content.
   * dax-sh doesn't populate error.stderr when using custom streams,
   * so we need to add it from our collector.
   * Note: dax-sh throws plain Error with message pattern "Exited with code: X"
   */
  const enhanceErrorWithStderr = (error: unknown): unknown => {
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      // Check for dax error pattern (message starts with "Exited with code:")
      const isDaxError = typeof errorObj['message'] === 'string'
        && (errorObj['message'] as string).startsWith('Exited with code:');
      if (isDaxError && !errorObj['stderr']) {
        const stderrBytes = stderrCollector.getBytes();
        if (stderrBytes.length > 0) {
          errorObj['stderr'] = stderrBytes;
          // Also set name to 'ShellError' for compatibility with error handlers
          errorObj['name'] = 'ShellError';
        }
      }
    }
    return error;
  };

  /**
   * Enhances a CommandResult with captured stdout/stderr from our streams.
   * dax's CommandResult throws when accessing stdout/stderr if they were streamed,
   * so we need to provide our captured data instead.
   */
  const enhanceResultWithStreams = (result: unknown): unknown => {
    if (typeof result !== 'object' || result === null) {
      return result;
    }

    const resultObj = result as Record<string, unknown>;

    // Check if this looks like a dax CommandResult (has 'code' property and getters that throw)
    if (typeof resultObj['code'] !== 'number') {
      return result;
    }

    // Create a proxy that intercepts stdout/stderr property access
    return new Proxy(result, {
      get(target, prop) {
        if (prop === 'stdout') {
          return decode(stdoutCollector.getBytes());
        }
        if (prop === 'stderr') {
          return decode(stderrCollector.getBytes());
        }
        if (prop === 'stdoutBytes') {
          return stdoutCollector.getBytes();
        }
        if (prop === 'stderrBytes') {
          return stderrCollector.getBytes();
        }
        return Reflect.get(target, prop);
      },
    });
  };

  const wrapWithProxy = (cmd: CommandBuilder): CommandBuilder => {
    return new Proxy(cmd, {
      get(target, prop) {
        const propName = String(prop);

        // For output methods, execute and transform
        const transform = outputMethods[propName];
        if (transform) {
          return async () => {
            try {
              await target;
              return transform(stdoutCollector.getBytes());
            } catch (error) {
              throw enhanceErrorWithStderr(error);
            }
          };
        }

        // For then, wrap both success and error handlers
        if (propName === 'then') {
          const originalThen = Reflect.get(target, prop) as (
            onfulfilled?: (value: unknown) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) => Promise<unknown>;
          return (
            onfulfilled?: (value: unknown) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ): Promise<unknown> => {
            return originalThen.call(
              target,
              (result) => {
                const enhanced = enhanceResultWithStreams(result);
                if (onfulfilled) {
                  return onfulfilled(enhanced);
                }
                return enhanced;
              },
              (error) => {
                const enhanced = enhanceErrorWithStderr(error);
                if (onrejected) {
                  return onrejected(enhanced);
                }
                throw enhanced;
              },
            );
          };
        }

        // For catch/finally, just return as-is
        if (propName === 'catch' || propName === 'finally') {
          return Reflect.get(target, prop);
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
      },
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
