import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { PostDownloadInstallContext, PostExtractInstallContext, ToolConfig } from '@types';
import type { HookExecutor } from '../HookExecutor';
import { installerLogMessages } from '../log-messages';

/**
 * Result of hook execution
 */
export interface HookExecutionResult {
  success: boolean;
  error?: string;
}

/**
 * Execute afterDownload hook if defined in tool config
 * Extracted from duplicated code in installFromGitHubRelease, installFromCurlScript, installFromCurlTar
 */
export async function executeAfterDownloadHook(
  toolConfig: ToolConfig,
  context: PostDownloadInstallContext,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
): Promise<HookExecutionResult> {
  if (!toolConfig.installParams?.hooks?.afterDownload) {
    return { success: true };
  }

  logger.debug(installerLogMessages.hooks.afterDownload());

  const enhancedContext = hookExecutor.createEnhancedContext(context, fs);
  const hookResult = await hookExecutor.executeHook(
    'afterDownload',
    toolConfig.installParams.hooks.afterDownload,
    enhancedContext
  );

  if (!hookResult.success) {
    return {
      success: false,
      error: `afterDownload hook failed: ${hookResult.error}`,
    };
  }

  return { success: true };
}

/**
 * Execute afterExtract hook if defined in tool config
 * Extracted from duplicated code in installFromGitHubRelease, installFromCurlTar
 */
export async function executeAfterExtractHook(
  toolConfig: ToolConfig,
  context: PostExtractInstallContext,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
): Promise<HookExecutionResult> {
  if (!toolConfig.installParams?.hooks?.afterExtract) {
    return { success: true };
  }

  logger.debug(installerLogMessages.hooks.afterExtract());

  const enhancedContext = hookExecutor.createEnhancedContext(context, fs);
  const hookResult = await hookExecutor.executeHook(
    'afterExtract',
    toolConfig.installParams.hooks.afterExtract,
    enhancedContext
  );

  if (!hookResult.success) {
    return {
      success: false,
      error: `afterExtract hook failed: ${hookResult.error}`,
    };
  }

  return { success: true };
}
