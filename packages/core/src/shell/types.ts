import type { TsLogger } from '@dotfiles/logger';

/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  /** Exit code of the process */
  code: number;
  /** Stdout as string */
  stdout: string;
  /** Stderr as string */
  stderr: string;
}

/**
 * Options for shell command execution.
 */
export interface ShellOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string | undefined>;
  /** Logger for real-time output streaming */
  logger?: TsLogger;
  /** If true, don't log output (command still logged if not skipCommandLog) */
  quiet?: boolean;
  /** If true, don't throw on non-zero exit code */
  noThrow?: boolean;
  /** If true, only log output, not the command itself (for wrapped shells) */
  skipCommandLog?: boolean;
}

/**
 * A chainable shell command builder.
 * Supports fluent API: shell`cmd`.cwd('/tmp').env({FOO: 'bar'}).quiet().text()
 */
export interface ShellCommand extends PromiseLike<ShellResult> {
  /** Set working directory */
  cwd(path: string): ShellCommand;
  /** Set/merge environment variables */
  env(vars: Record<string, string | undefined>): ShellCommand;
  /** Suppress output logging (command still logged) */
  quiet(): ShellCommand;
  /** Don't throw on non-zero exit code, return result with code instead */
  noThrow(): ShellCommand;
  /** Get stdout as trimmed string */
  text(): Promise<string>;
  /** Parse stdout as JSON */
  json<T = unknown>(): Promise<T>;
  /** Get stdout as array of lines */
  lines(): Promise<string[]>;
  /** Get stdout as bytes */
  bytes(): Promise<Uint8Array>;
}

/**
 * Shell factory function type - callable with template literals.
 */
export interface Shell {
  (strings: TemplateStringsArray, ...values: unknown[]): ShellCommand;
  (command: string): ShellCommand;
}

export const extendedShellBrand: unique symbol = Symbol('extendedShellBrand');
export const loggingShellBrand: unique symbol = Symbol('loggingShellBrand');

/**
 * A configured shell instance with brand symbols for type checking.
 * This is now an alias for Shell with brand symbols during migration.
 */
export type $extended = Shell & {
  readonly [extendedShellBrand]: true;
};
