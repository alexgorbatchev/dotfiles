import path from 'node:path';
import {
  type $extended,
  type AsyncInstallHook,
  createLoggingShell,
  type IInstallBaseContext,
  type IOperationFailure,
  type IOperationSuccess,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { ShellExpression } from 'bun';
import { extractErrorCause } from './extractErrorCause';
import { messages } from './log-messages';
import { writeHookErrorDetails } from './writeHookErrorDetails';

function isShellError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const errorObj = error as Record<string, unknown>;
  return errorObj['name'] === 'ShellError';
}

export type HookHandler<TContext extends IInstallBaseContext = IInstallBaseContext> = AsyncInstallHook<TContext>;

function createToolConfigCwdShell($shell: $extended, cwdPath: string): $extended {
  const configuredShell: $extended = Object.assign(
    (strings: TemplateStringsArray, ...expressions: ShellExpression[]) => {
      const shellPromise = $shell(strings, ...expressions).cwd(cwdPath);
      return shellPromise;
    },
    $shell
  );

  return configuredShell;
}

/**
 * Creates a shell wrapper that includes additional directories in the PATH environment variable.
 * This allows commands to find binaries in the specified directories without needing full paths.
 *
 * WORKAROUND: Due to a bun shell bug where `.env()` PATH changes don't affect command resolution
 * (command lookup uses process.env.PATH, not the shell's export_env), we wrap commands in `sh -c`.
 * This delegates command resolution to the subshell which correctly inherits the modified PATH.
 * See: https://github.com/oven-sh/bun/issues/XXXX
 *
 * @param $shell - The base shell instance to wrap
 * @param additionalPaths - Array of directory paths to prepend to PATH
 * @returns A new shell instance with enhanced PATH
 */
function createShellWithEnhancedPath($shell: $extended, additionalPaths: string[]): $extended {
  if (additionalPaths.length === 0) {
    return $shell;
  }

  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const currentPath = process.env['PATH'] || '';
  const enhancedPath = [...additionalPaths, currentPath].join(pathSeparator);

  // Merge the enhanced PATH with current process.env to preserve all environment variables
  const enhancedEnv: Record<string, string | undefined> = {
    ...process.env,
    PATH: enhancedPath,
  };

  const configuredShell: $extended = Object.assign(
    (strings: TemplateStringsArray, ...expressions: ShellExpression[]) => {
      // Build the command string from the template literal
      // Bun shell escapes ${} expressions, so we reconstruct the intended command
      let command = strings[0] || '';
      for (let i = 0; i < expressions.length; i++) {
        command += String(expressions[i]) + (strings[i + 1] || '');
      }

      // Wrap in sh -c so the subshell inherits PATH and performs command resolution
      // Bun escapes ${command} as a single argument, preventing injection
      const shellPromise = $shell`sh -c ${command}`.env(enhancedEnv);
      return shellPromise;
    },
    $shell
  );

  return configuredShell;
}

/**
 * Configuration options for controlling hook execution behavior.
 */
export interface IHookExecutionOptions {
  /** Timeout in milliseconds for hook execution (default: 60000ms) */
  timeoutMs?: number;
  /** Whether to continue installation if hook fails (default: false) */
  continueOnError?: boolean;
}

/**
 * Result of hook execution including success status, error details, and timing information.
 * Indicates whether hook completed successfully or failed, and whether it was skipped.
 */
export type HookExecutionResult =
  | (IOperationSuccess & {
      /** Duration of hook execution in milliseconds */
      durationMs: number;
      /** Whether hook was skipped due to timeout or other reason */
      skipped: boolean;
    })
  | (IOperationFailure & {
      /** Duration of hook execution in milliseconds */
      durationMs: number;
      /** Whether hook was skipped due to timeout or other reason */
      skipped: boolean;
    });

/**
 * Complete definition of a hook including the function, name, and execution options.
 * Used by `executeHooks` to run multiple hooks in sequence.
 */
export interface IHookDefinition<TContext extends IInstallBaseContext = IInstallBaseContext> {
  /** Name of the hook */
  name: string;
  /** Hook function to execute */
  hook: HookHandler<TContext>;
  /** Optional execution options */
  options?: IHookExecutionOptions;
}

/**
 * Executes installation hooks with proper error handling, timeouts, and context management.
 * Provides a consistent way to run beforeInstall, afterDownload, afterExtract, and afterInstall hooks.
 *
 * Features:
 * - Timeout enforcement (default 60 seconds)
 * - Error handling with optional continue-on-error
 * - Execution duration tracking
 * - Tool-specific logging via subloggers
 * - Enhanced context creation with file system and shell access
 * - Sequential execution of multiple hooks
 *
 * Note: This class does NOT store a logger. All methods require a parentLogger parameter
 * to ensure proper tool context propagation through the logging hierarchy.
 */
type WriteOutput = (chunk: string) => void;

export class HookExecutor {
  private readonly defaultTimeoutMs = 60000; // 1 minute default
  private readonly writeOutput: WriteOutput;

  constructor(writeOutput: WriteOutput) {
    this.writeOutput = writeOutput;
  }

  /**
   * Executes a single hook with proper error handling, timeout enforcement, and logging.
   * Creates a hook-specific logger and races the hook execution against a timeout promise.
   *
   * The hook receives an enhanced context with:
   * - fileSystem: Tool-specific TrackedFileSystem for file operations
   * - toolConfig: Tool configuration (if available in base context)
   * - $: Bun's shell operator for executing commands
   *
   * @param parentLogger - Logger with tool context for proper log hierarchy
   * @param hookName - Name of the hook for logging (e.g., 'beforeInstall', 'afterDownload')
   * @param hook - Hook function to execute
   * @param enhancedContext - Enhanced context with file system and shell access
   * @param options - Execution options (timeout, continueOnError)
   * @returns Result with success status, duration, and error details if failed
   */
  async executeHook<TContext extends IInstallBaseContext>(
    parentLogger: TsLogger,
    hookName: string,
    hook: HookHandler<TContext>,
    enhancedContext: TContext,
    options: IHookExecutionOptions = {}
  ): Promise<HookExecutionResult> {
    const methodLogger = parentLogger
      .getSubLogger({ name: 'HookExecutor' })
      .getSubLogger({ name: 'executeHook', context: hookName });
    const timeoutMs: number = options.timeoutMs ?? this.defaultTimeoutMs;
    const continueOnError: boolean = options.continueOnError ?? false;
    const startTime = Date.now();

    methodLogger.debug(messages.hookExecutor.executingHook(hookName, timeoutMs));

    // Track the timeout timer so we can clear it when hook completes
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Create a promise that resolves when the hook completes
      const hookPromise = hook(enhancedContext);

      // Create a timeout promise that rejects after timeoutMs
      const timeoutPromise: Promise<never> = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(messages.hookExecutor.timeoutExceeded(hookName, timeoutMs)));
        }, timeoutMs);
      });

      // Race the hook against the timeout
      await Promise.race([hookPromise, timeoutPromise]);

      // Clear the timeout to prevent it from keeping the event loop alive
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const durationMs: number = Date.now() - startTime;
      methodLogger.debug(messages.hookExecutor.hookCompleted(hookName, durationMs));

      const result: HookExecutionResult = {
        success: true,
        durationMs,
        skipped: false,
      };
      return result;
    } catch (error) {
      // Clear the timeout to prevent it from keeping the event loop alive
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const durationMs: number = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = extractErrorCause(error);

      // Log the error with cause in message - the logger filters stack traces for user-facing levels
      methodLogger.error(messages.outcome.hookFailed(errorCause), error);

      // For shell errors, write additional details (code frame) via writeHookErrorDetails
      if (isShellError(error)) {
        await writeHookErrorDetails({
          fileSystem: enhancedContext.fileSystem,
          logger: methodLogger,
          hookName,
          toolName: enhancedContext.toolName,
          error,
          writeOutput: this.writeOutput,
        });
      }

      if (continueOnError) {
        methodLogger.debug(messages.hookExecutor.continuingDespiteFailure(hookName));
      }

      const result: HookExecutionResult = {
        success: false,
        error: errorMessage,
        durationMs,
        skipped: false,
      };
      return result;
    }
  }

  /**
   * Creates an enhanced context for hook execution by adding file system, shell access, and toolConfig.
   * Ensures hooks have all necessary dependencies while maintaining file tracking capabilities.
   *
   * Enhancements:
   * - fileSystem: Tool-specific TrackedFileSystem or provided filesystem
   * - toolConfig: Extracted from InstallContext if available
   * - $: Bun's shell operator for executing commands with:
   *   - Working directory set to tool config directory (if configFilePath exists)
   *   - PATH enhanced with binary directories (if binaryPaths exists, e.g., for after-install hooks)
   *     This allows hooks to execute freshly installed binaries by name without full paths.
   *   - Command logging (if logger provided): Commands logged as `$ cmd`, output as `| line`
   *
   * The TrackedFileSystem integration allows proper tracking of file operations
   * performed by hooks for registry management.
   *
   * @example
   * ```typescript
   * // In after-install hooks, binaries are automatically in PATH:
   * .hook('after-install', async ({ $ }) => {
   *   await $`my-tool --version`; // Works without full path
   * })
   * ```
   *
   * @param baseContext - Base install or hook context with tool information
   * @param fileSystem - File system instance (may be TrackedFileSystem)
   * @param logger - Optional logger for command/output logging
   * @returns Enhanced context ready for hook execution
   */
  createEnhancedContext<TContext extends IInstallBaseContext>(
    baseContext: TContext,
    fileSystem: IFileSystem,
    logger?: TsLogger
  ): TContext {
    // Create a tool-specific TrackedFileSystem if we have one
    const enhancedFileSystem: IFileSystem =
      fileSystem instanceof TrackedFileSystem ? fileSystem.withToolName(baseContext.toolName) : fileSystem;

    const toolConfigFilePath: string | undefined = baseContext.toolConfig?.configFilePath;
    const toolConfigDirPath: string | undefined = toolConfigFilePath ? path.dirname(toolConfigFilePath) : undefined;

    // Extract unique binary directories from binaryPaths (if present, e.g., for after-install context)
    const binaryPaths: string[] =
      'binaryPaths' in baseContext && Array.isArray(baseContext.binaryPaths) ? baseContext.binaryPaths : [];
    const binaryDirs: string[] = [...new Set(binaryPaths.map((p) => path.dirname(p)))];

    // Start with the base shell
    let enhancedShell: $extended = baseContext.$;

    // Add binary directories to PATH if present
    if (binaryDirs.length > 0) {
      enhancedShell = createShellWithEnhancedPath(enhancedShell, binaryDirs);
    }

    // Set working directory to tool config directory if available
    if (toolConfigDirPath) {
      enhancedShell = createToolConfigCwdShell(enhancedShell, toolConfigDirPath);
    }

    // Wrap shell with logging if logger is provided
    if (logger) {
      enhancedShell = createLoggingShell(enhancedShell, logger, { cwd: toolConfigDirPath });
    }

    const result: TContext = {
      ...baseContext,
      $: enhancedShell,
      fileSystem: enhancedFileSystem,
    };
    return result;
  }

  /**
   * Executes multiple hooks in sequence with proper error handling and result tracking.
   * Stops execution if a hook fails and continueOnError is not set for that hook.
   *
   * Use this method to run a series of hooks at once, useful for batch operations
   * or when hooks have dependencies on each other's execution order.
   *
   * @param parentLogger - Logger with tool context for proper log hierarchy
   * @param hooks - Array of hook definitions with names, functions, and options
   * @param enhancedContext - Enhanced context shared across all hooks
   * @returns Array of execution results for each hook
   */
  async executeHooks<TContext extends IInstallBaseContext>(
    parentLogger: TsLogger,
    hooks: IHookDefinition<TContext>[],
    enhancedContext: TContext
  ): Promise<HookExecutionResult[]> {
    const methodLogger = parentLogger.getSubLogger({ name: 'HookExecutor' }).getSubLogger({ name: 'executeHooks' });
    const results: HookExecutionResult[] = [];

    for (const hookDefinition of hooks) {
      const name: string = hookDefinition.name;
      const hook: HookHandler<TContext> = hookDefinition.hook;
      const options: IHookExecutionOptions | undefined = hookDefinition.options;

      const result = await this.executeHook(parentLogger, name, hook, enhancedContext, options);
      results.push(result);

      // If hook failed and we're not continuing on error, stop execution
      if (!result.success && !options?.continueOnError) {
        methodLogger.debug(messages.hookExecutor.stoppingDueToFailure(name));
        break;
      }
    }

    const finalResults: HookExecutionResult[] = results;
    return finalResults;
  }
}
