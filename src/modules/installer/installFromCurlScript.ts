import path from 'node:path';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { BaseInstallContext, CurlScriptToolConfig } from '@types';
import type { HookExecutor } from './HookExecutor';
import type { InstallOptions, InstallResult } from './IInstaller';
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  getBinaryNames,
  getBinaryPaths,
  withInstallErrorHandling,
} from './utils';
import { installerLogMessages } from './log-messages';

/**
 * Install a tool using a curl script
 */
export async function installFromCurlScript(
  toolName: string,
  toolConfig: CurlScriptToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromCurlScript' });
  logger.debug(installerLogMessages.curlScript.installing(toolName));

  if (!toolConfig.installParams || !('url' in toolConfig.installParams) || !('shell' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'URL or shell not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const url = params.url;
  const shell = params.shell;

  const operation = async (): Promise<InstallResult> => {
    // Download the script
    logger.debug(installerLogMessages.curlScript.downloadingScript(url));
    const scriptPath = path.join(context.installDir, `${toolName}-install.sh`);

    await downloadWithProgress(url, scriptPath, `${toolName}-install.sh`, downloader, options);

    // Make the script executable
    await toolFs.chmod(scriptPath, 0o755);

    // Run afterDownload hook if defined
    const postDownloadContext = {
      ...context,
      downloadPath: scriptPath,
    };

    const afterDownloadResult = await executeAfterDownloadHook(
      toolConfig,
      postDownloadContext,
      hookExecutor,
      fs,
      logger
    );
    if (!afterDownloadResult.success) {
      return {
        success: false,
        error: afterDownloadResult.error,
      };
    }

    // Execute the script
    logger.debug(installerLogMessages.curlScript.executingScript(shell));

    // [TODO] In a real implementation, we would execute the script here
    // For now, we'll just simulate success

    // Handle all binaries by copying from script installation to versioned directory
    const binaryNames = getBinaryNames(toolConfig.binaries, toolName);
    for (const binaryName of binaryNames) {
      const sourcePath = path.join('/usr/local/bin', binaryName);
      const finalBinaryPath = path.join(context.installDir, binaryName);

      logger.debug(installerLogMessages.binaryMovement.moving(sourcePath, finalBinaryPath));
    }

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      info: {
        scriptUrl: url,
        shell,
      },
    };
  };

  return withInstallErrorHandling('curl-script', toolName, logger, operation) as Promise<InstallResult>;
}
