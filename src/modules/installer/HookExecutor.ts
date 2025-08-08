import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system';
import type { AsyncInstallHook, InstallHookContext, BaseInstallContext } from '@types';
import { TrackedFileSystem } from '@modules/file-registry';
import { $ } from 'zx';
import path from 'node:path';

/**
 * Enhanced context for installation hooks with additional utilities
 * This extends the standard InstallHookContext with extra development conveniences
 */
export interface EnhancedInstallHookContext extends InstallHookContext {
  /** File system instance for performing file operations */
  fileSystem: IFileSystem;
  /** Logger instance for structured logging */
  logger: TsLogger;
  /** Binary path (available in afterInstall hook) */
  binaryPath?: string;
  /** Version of the installed tool (available in afterInstall hook) */
  version?: string;
  /** The user's application configuration (available in all hooks) */
  appConfig?: import('@modules/config').YamlConfig;
  /** The full tool configuration being processed (available in all hooks) */
  toolConfig?: import('@types').ToolConfig;
  /** ZX shell executor with cwd set to the .tool.ts file directory */
  $: ReturnType<typeof $>;
}

/**
 * Options for hook execution
 */
export interface HookExecutionOptions {
  /** Timeout in milliseconds for hook execution (default: 60000ms) */
  timeoutMs?: number;
  /** Whether to continue installation if hook fails (default: false) */
  continueOnError?: boolean;
}

/**
 * Result of hook execution
 */
export interface HookExecutionResult {
  /** Whether the hook executed successfully */
  success: boolean;
  /** Error message if hook failed */
  error?: string;
  /** Duration of hook execution in milliseconds */
  durationMs: number;
  /** Whether hook was skipped due to timeout or other reason */
  skipped: boolean;
}

/**
 * Executes installation hooks with proper error handling, timeouts, and tracking
 */
export class HookExecutor {
  private readonly logger: TsLogger;
  private readonly defaultTimeoutMs = 60000; // 1 minute default

  constructor(parentLogger: TsLogger) {
    this.logger = parentLogger.getSubLogger({ name: 'HookExecutor' });
  }

  /**
   * Execute a single hook with error handling and timeout
   */
  async executeHook(
    hookName: string,
    hook: AsyncInstallHook,
    context: EnhancedInstallHookContext,
    options: HookExecutionOptions = {}
  ): Promise<HookExecutionResult> {
    const { timeoutMs = this.defaultTimeoutMs, continueOnError = false } = options;
    const startTime = Date.now();

    this.logger.debug(logs.hookExecutor.debug.executingHook(), hookName, timeoutMs);

    // Create hook-specific logger and update context
    const hookSpecificLogger = context.logger.getSubLogger({ name: `${context.toolName}--${hookName}` });
    const hookContext = { ...context, logger: hookSpecificLogger };

    try {
      // Create a promise that resolves when the hook completes
      const hookPromise = hook(hookContext);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(logs.command.error.timeout(hookName, timeoutMs)));
        }, timeoutMs);
      });

      // Race the hook against the timeout
      await Promise.race([hookPromise, timeoutPromise]);

      const durationMs = Date.now() - startTime;
      this.logger.debug(logs.hookExecutor.debug.hookCompleted(), hookName, durationMs);

      return {
        success: true,
        durationMs,
        skipped: false,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        logs.tool.error.installFailed(`${hookName} hook`, context.toolName, errorMessage)
      );

      if (continueOnError) {
        this.logger.debug(logs.hookExecutor.debug.continuingDespiteFailure(), hookName);
        
        return {
          success: false,
          error: errorMessage,
          durationMs,
          skipped: false,
        };
      } else {
        return {
          success: false,
          error: errorMessage,
          durationMs,
          skipped: false,
        };
      }
    }
  }

  /**
   * Create enhanced context for hook execution with proper filesystem tracking
   */
  createEnhancedContext(
    baseContext: BaseInstallContext | InstallHookContext,
    fileSystem: IFileSystem,
    logger: TsLogger
  ): EnhancedInstallHookContext {
    // Create a tool-specific TrackedFileSystem if we have one
    const enhancedFileSystem = fileSystem instanceof TrackedFileSystem 
      ? fileSystem.withToolName(baseContext.toolName)
      : fileSystem;

    // Extract appConfig and toolConfig from BaseInstallContext if available
    const appConfig = 'appConfig' in baseContext ? baseContext.appConfig : undefined;
    const toolConfig = 'toolConfig' in baseContext ? baseContext.toolConfig : undefined;

    // Create ZX $ instance with cwd set to the directory of the .tool.ts file
    let zxInstance: ReturnType<typeof $>;
    if (toolConfig?.configFilePath) {
      const toolConfigDir = path.dirname(toolConfig.configFilePath);
      zxInstance = $({ cwd: toolConfigDir });
    } else {
      // Fallback to default $ instance if no config file path is available
      zxInstance = $;
    }

    return {
      ...baseContext,
      fileSystem: enhancedFileSystem,
      logger: logger.getSubLogger({ name: baseContext.toolName }),
      appConfig,
      toolConfig,
      $: zxInstance,
    };
  }

  /**
   * Execute multiple hooks in sequence with proper logging and error handling
   */
  async executeHooks(
    hooks: Array<{ name: string; hook: AsyncInstallHook; options?: HookExecutionOptions }>,
    context: EnhancedInstallHookContext
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    for (const { name, hook, options } of hooks) {
      const result = await this.executeHook(name, hook, context, options);
      results.push(result);

      // If hook failed and we're not continuing on error, stop execution
      if (!result.success && !options?.continueOnError) {
        this.logger.debug(logs.hookExecutor.debug.stoppingDueToFailure(), name);
        break;
      }
    }

    return results;
  }
}