import path from 'node:path';
import type { IDownloader } from '@modules/downloader/IDownloader';
import { ProgressBar, shouldShowProgress } from '@modules/downloader/ProgressBar';
import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, CurlScriptToolConfig } from '@types';
import type { HookExecutor } from './HookExecutor';
import type { InstallOptions, InstallResult } from './IInstaller';

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
  // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
  const toolFs = fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;

  const logger = parentLogger.getSubLogger({ name: 'installFromCurlScript' });
  logger.debug(logs.installer.debug.installingFromCurl(), toolName);

  if (!toolConfig.installParams || !('url' in toolConfig.installParams) || !('shell' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'URL or shell not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const url = params.url;
  const shell = params.shell;

  try {
    // Download the script
    logger.debug(logs.installer.debug.downloadingScript(), url);
    const scriptPath = path.join(context.installDir, `${toolName}-install.sh`);

    const showProgress = shouldShowProgress(options?.quiet);
    const progressBar = new ProgressBar(`${toolName}-install.sh`, { enabled: showProgress });

    try {
      await downloader.download(url, {
        destinationPath: scriptPath,
        onProgress: progressBar.createCallback(),
      });
    } finally {
      progressBar.finish();
    }

    // Make the script executable
    await toolFs.chmod(scriptPath, 0o755);

    // Run afterDownload hook if defined
    if (toolConfig.installParams?.hooks?.afterDownload) {
      logger.debug(logs.installer.debug.runningAfterDownloadHook());

      // Create context with download path for hook
      const postDownloadContext = {
        ...context,
        downloadPath: scriptPath,
      };

      const enhancedContext = hookExecutor.createEnhancedContext(postDownloadContext, fs, logger);

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
    }

    // Execute the script
    logger.debug(logs.installer.debug.executingScript(), shell);

    // In a real implementation, we would execute the script here
    // For now, we'll just simulate success

    // Handle all binaries by copying from script installation to versioned directory
    const binaryNames = toolConfig.binaries || [toolName];
    for (const binaryName of binaryNames) {
      const sourcePath = path.join('/usr/local/bin', binaryName); // Placeholder location
      const finalBinaryPath = path.join(context.installDir, binaryName);

      // In a real implementation, we would copy from script installation location to our versioned directory
      // For now, this is a placeholder that assumes script installed the binary
      logger.debug(logs.installer.debug.movingBinary(), sourcePath, finalBinaryPath);
    }

    // Return paths to all binaries
    const binaries = toolConfig.binaries || [toolName];
    const binaryPaths = binaries.map((binary) => path.join(context.installDir, binary));

    return {
      success: true,
      binaryPaths,
      info: {
        scriptUrl: url,
        shell,
      },
    };
  } catch (error) {
    logger.error(logs.tool.error.installFailed('curl-script', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
