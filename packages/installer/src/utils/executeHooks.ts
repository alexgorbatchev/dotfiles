import type {
  BaseInstallParams,
  IDownloadContext,
  IExtractContext,
  IOperationFailure,
  IOperationSuccess,
  ToolConfig,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { HookExecutor } from './HookExecutor';
import { messages } from './log-messages';

/**
 * Result type for hook execution indicating success or failure with error message.
 */
export type ExecuteHooksResult = IOperationSuccess | IOperationFailure;

/**
 * Extracts hooks from tool configuration's install params.
 * Uses type assertion since all install params extend BaseInstallParams which has hooks.
 */
function getHooksFromConfig(toolConfig: ToolConfig): BaseInstallParams['hooks'] | undefined {
  const installParams = toolConfig.installParams as BaseInstallParams | undefined;
  return installParams?.hooks;
}

/**
 * Executes the afterDownload hook if defined in tool configuration.
 * Returns immediately with success if no hook is configured.
 *
 * The afterDownload hook runs after a file has been downloaded but before
 * any extraction or processing. Common uses include:
 * - Validating downloaded file integrity
 * - Modifying download before extraction
 * - Preparing environment for extraction
 *
 * @param toolConfig - Tool configuration that may contain afterDownload hook
 * @param context - Post-download context with downloadPath
 * @param hookExecutor - Hook executor for proper context and error handling
 * @param fs - File system interface for hook file operations
 * @param logger - Logger for hook execution messages
 * @returns Success result or failure with error message
 */
export async function executeAfterDownloadHook(
  toolConfig: ToolConfig,
  context: IDownloadContext,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
): Promise<ExecuteHooksResult> {
  const hooks = getHooksFromConfig(toolConfig);
  const afterDownloadHooks = hooks?.['after-download'];

  if (!afterDownloadHooks) {
    return { success: true };
  }

  logger.debug(messages.lifecycle.hookExecution('after-download'));

  const enhancedContext = hookExecutor.createEnhancedContext(context, fs);

  for (const hook of afterDownloadHooks) {
    const hookResult = await hookExecutor.executeHook('after-download', hook, enhancedContext);

    if (!hookResult.success) {
      return {
        success: false,
        error: `afterDownload hook failed: ${hookResult.error}`,
      };
    }
  }

  return { success: true };
}

/**
 * Executes the afterExtract hook if defined in tool configuration.
 * Returns immediately with success if no hook is configured.
 *
 * The afterExtract hook runs after an archive has been extracted but before
 * binary setup. Common uses include:
 * - Moving binaries to expected locations
 * - Renaming extracted files
 * - Building from source
 * - Cleaning up unnecessary files
 *
 * @param toolConfig - Tool configuration that may contain afterExtract hook
 * @param context - Post-extract context with extractDir and extractResult
 * @param hookExecutor - Hook executor for proper context and error handling
 * @param fs - File system interface for hook file operations
 * @param logger - Logger for hook execution messages
 * @returns Success result or failure with error message
 */
export async function executeAfterExtractHook(
  toolConfig: ToolConfig,
  context: IExtractContext,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
): Promise<ExecuteHooksResult> {
  const hooks = getHooksFromConfig(toolConfig);
  const afterExtractHooks = hooks?.['after-extract'];

  if (!afterExtractHooks) {
    return { success: true };
  }

  logger.debug(messages.lifecycle.hookExecution('after-extract'));

  const enhancedContext = hookExecutor.createEnhancedContext(context, fs);

  for (const hook of afterExtractHooks) {
    const hookResult = await hookExecutor.executeHook('after-extract', hook, enhancedContext);

    if (!hookResult.success) {
      return {
        success: false,
        error: `afterExtract hook failed: ${hookResult.error}`,
      };
    }
  }

  return { success: true };
}
