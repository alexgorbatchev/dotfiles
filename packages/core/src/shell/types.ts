import type { TsLogger } from "@dotfiles/logger";

/**
 * Result of a shell command execution.
 */
export interface IShellResult {
  /** Exit code of the process */
  code: number;
  /** Stdout as string */
  stdout: string;
  /** Stderr as string */
  stderr: string;
}

export type ShellResult = IShellResult;

/**
 * Options for shell command execution.
 */
export interface IShellOptions {
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

export type ShellOptions = IShellOptions;

export type ShellCommandInput = TemplateStringsArray | string;
export type ShellCommandOnFulfilled<TResult> = ((value: IShellResult) => TResult | PromiseLike<TResult>) | null;
export type ShellCommandOnRejected<TResult> = ((reason: unknown) => TResult | PromiseLike<TResult>) | null;
export type ShellCommandThenResult<TResult1, TResult2> = Promise<TResult1 | TResult2>;

/**
 * A chainable shell command builder.
 * Supports fluent API: shell`cmd`.cwd('/tmp').env({FOO: 'bar'}).quiet().text()
 */
export interface IShellCommand extends PromiseLike<IShellResult> {
  /** Set working directory */
  cwd(path: string): IShellCommand;
  /** Set/merge environment variables */
  env(vars: Record<string, string | undefined>): IShellCommand;
  /** Suppress output logging (command still logged) */
  quiet(): IShellCommand;
  /** Don't throw on non-zero exit code, return result with code instead */
  noThrow(): IShellCommand;
  /** Get stdout as trimmed string */
  text(): Promise<string>;
  /** Parse stdout as JSON */
  json<T = unknown>(): Promise<T>;
  /** Get stdout as array of lines */
  lines(): Promise<string[]>;
  /** Get stdout as bytes */
  bytes(): Promise<Uint8Array>;
}

export type ShellCommand = IShellCommand;

/**
 * Shell factory function type - callable with template literals.
 */
export interface IShell {
  (strings: TemplateStringsArray, ...values: unknown[]): IShellCommand;
  (command: string): IShellCommand;
}

export type Shell = IShell;
