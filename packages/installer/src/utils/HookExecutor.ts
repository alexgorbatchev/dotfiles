import path from 'node:path';
import type {
  $extended,
  AsyncInstallHook,
  IInstallBaseContext,
  IOperationFailure,
  IOperationSuccess,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { ShellExpression } from 'bun';
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
 */
type WriteOutput = (chunk: string) => void;

export class HookExecutor {
  private readonly logger: TsLogger;
  private readonly defaultTimeoutMs = 60000; // 1 minute default
  private readonly writeOutput: WriteOutput;

  constructor(parentLogger: TsLogger, writeOutput: WriteOutput) {
    this.logger = parentLogger.getSubLogger({ name: 'HookExecutor' });
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
   * @param hookName - Name of the hook for logging (e.g., 'beforeInstall', 'afterDownload')
   * @param hook - Hook function to execute
   * @param enhancedContext - Enhanced context with file system and shell access
   * @param options - Execution options (timeout, continueOnError)
   * @returns Result with success status, duration, and error details if failed
   */
  async executeHook<TContext extends IInstallBaseContext>(
    hookName: string,
    hook: HookHandler<TContext>,
    enhancedContext: TContext,
    options: IHookExecutionOptions = {}
  ): Promise<HookExecutionResult> {
    const methodLogger = this.logger.getSubLogger({ name: 'executeHook', context: hookName });
    const timeoutMs: number = options.timeoutMs ?? this.defaultTimeoutMs;
    const continueOnError: boolean = options.continueOnError ?? false;
    const startTime = Date.now();

    methodLogger.debug(messages.hookExecutor.executingHook(hookName, timeoutMs));

    try {
      // Create a promise that resolves when the hook completes
      const hookPromise = hook(enhancedContext);

      // Create a timeout promise
      const timeoutPromise: Promise<never> = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(messages.hookExecutor.timeoutExceeded(hookName, timeoutMs)));
        }, timeoutMs);
      });

      // Race the hook against the timeout
      await Promise.race([hookPromise, timeoutPromise]);

      const durationMs: number = Date.now() - startTime;
      methodLogger.debug(messages.hookExecutor.hookCompleted(hookName, durationMs));

      const result: HookExecutionResult = {
        success: true,
        durationMs,
        skipped: false,
      };
      return result;
    } catch (error) {
      const durationMs: number = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      methodLogger.error(messages.outcome.hookFailed(), error);

      // Write detailed error output only for shell errors (includes stdout/stderr)
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
   * - $: Bun's shell operator for executing commands
   *
   * The TrackedFileSystem integration allows proper tracking of file operations
   * performed by hooks for registry management.
   *
   * @param baseContext - Base install or hook context with tool information
   * @param fileSystem - File system instance (may be TrackedFileSystem)
   * @returns Enhanced context ready for hook execution
   */
  createEnhancedContext<TContext extends IInstallBaseContext>(
    baseContext: TContext,
    fileSystem: IFileSystem
  ): TContext {
    // Create a tool-specific TrackedFileSystem if we have one
    const enhancedFileSystem: IFileSystem =
      fileSystem instanceof TrackedFileSystem ? fileSystem.withToolName(baseContext.toolName) : fileSystem;

    const toolConfigFilePath: string | undefined = baseContext.toolConfig?.configFilePath;
    const toolConfigDirPath: string | undefined = toolConfigFilePath ? path.dirname(toolConfigFilePath) : undefined;

    const shellWithDefaultCwd: $extended = toolConfigDirPath
      ? createToolConfigCwdShell(baseContext.$, toolConfigDirPath)
      : baseContext.$;

    const result: TContext = {
      ...baseContext,
      $: shellWithDefaultCwd,
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
   * @param hooks - Array of hook definitions with names, functions, and options
   * @param enhancedContext - Enhanced context shared across all hooks
   * @returns Array of execution results for each hook
   */
  async executeHooks<TContext extends IInstallBaseContext>(
    hooks: IHookDefinition<TContext>[],
    enhancedContext: TContext
  ): Promise<HookExecutionResult[]> {
    const methodLogger = this.logger.getSubLogger({ name: 'executeHooks' });
    const results: HookExecutionResult[] = [];

    for (const hookDefinition of hooks) {
      const name: string = hookDefinition.name;
      const hook: HookHandler<TContext> = hookDefinition.hook;
      const options: IHookExecutionOptions | undefined = hookDefinition.options;

      const result = await this.executeHook(name, hook, enhancedContext, options);
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
