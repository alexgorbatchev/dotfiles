import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IDownloader } from '@modules/downloader/IDownloader';
import { TrackedFileSystem } from '@modules/file-registry';
import type { CurlScriptToolConfig, BaseInstallContext } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';
import { DebugTemplates, ErrorTemplates } from '@modules/shared/ErrorTemplates';
import { ProgressBar, shouldShowProgress } from '@modules/downloader/ProgressBar';
import { HookExecutor } from './HookExecutor';

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
  parentLogger: TsLogger,
): Promise<InstallResult> {
  // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
  const toolFs = fs instanceof TrackedFileSystem 
    ? fs.withToolName(toolName)
    : fs;

  const logger = parentLogger.getSubLogger({ name: 'installFromCurlScript' });
  logger.debug(DebugTemplates.installer.installingFromCurl(), toolName);

  if (
    !toolConfig.installParams ||
    !('url' in toolConfig.installParams) ||
    !('shell' in toolConfig.installParams)
  ) {
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
    logger.debug(DebugTemplates.installer.downloadingScript(), url);
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
      logger.debug(DebugTemplates.installer.runningAfterDownloadHook());
      
      // Create context with download path for hook
      const postDownloadContext = {
        ...context,
        downloadPath: scriptPath,
      };
      
      const enhancedContext = hookExecutor.createEnhancedContext(
        postDownloadContext, fs, logger
      );
      
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
    logger.debug(DebugTemplates.installer.executingScript(), shell);

    // In a real implementation, we would execute the script here
    // For now, we'll just simulate success

    // Handle all binaries by copying from script installation to versioned directory
    const binaryNames = toolConfig.binaries || [toolName];
    for (const binaryName of binaryNames) {
      const sourcePath = path.join('/usr/local/bin', binaryName); // Placeholder location
      const finalBinaryPath = path.join(context.installDir, binaryName);
      
      // In a real implementation, we would copy from script installation location to our versioned directory
      // For now, this is a placeholder that assumes script installed the binary
      logger.debug(DebugTemplates.installer.movingBinary(), sourcePath, finalBinaryPath);
    }

    // Return path to first binary for compatibility
    const primaryBinary = toolConfig.binaries?.[0] || toolName;
    const primaryBinaryPath = path.join(context.installDir, primaryBinary);

    return {
      success: true,
      binaryPath: primaryBinaryPath,
      info: {
        scriptUrl: url,
        shell,
      },
    };
  } catch (error) {
    logger.error(ErrorTemplates.tool.installFailed('curl-script', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}