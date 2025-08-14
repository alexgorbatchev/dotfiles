import path from 'node:path';
import type { IDownloader } from '@modules/downloader/IDownloader';
import { ProgressBar, shouldShowProgress } from '@modules/downloader/ProgressBar';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type {
  BaseInstallContext,
  CurlTarToolConfig,
  ExtractResult,
  PostDownloadInstallContext,
  PostExtractInstallContext,
} from '@types';
import { setupBinariesFromArchive } from './BinarySetupService';
import type { HookExecutor } from './HookExecutor';
import type { InstallOptions, InstallResult } from './IInstaller';

/**
 * Install a tool from a tarball using curl
 */
export async function installFromCurlTar(
  toolName: string,
  toolConfig: CurlTarToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<InstallResult> {
  // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
  const toolFs = fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;

  const logger = parentLogger.getSubLogger({ name: 'installFromCurlTar' });
  logger.debug(logs.installer.debug.installingFromCurlTar(), toolName);

  // Context variables for lifecycle stages
  let postDownloadContext: PostDownloadInstallContext;
  let postExtractContext: PostExtractInstallContext | undefined;

  if (!toolConfig.installParams || !('url' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'URL not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const url = params.url;
  // extractPath is now handled as extractPathInArchive below

  try {
    // Download the tarball
    logger.debug(logs.installer.debug.downloadingTarball(), url);
    const tarballPath = path.join(context.installDir, `${toolName}.tar.gz`); // Assuming .tar.gz, adjust if needed

    const showProgress = shouldShowProgress(options?.quiet);
    const progressBar = new ProgressBar(`${toolName}.tar.gz`, { enabled: showProgress });

    try {
      await downloader.download(url, {
        destinationPath: tarballPath,
        onProgress: progressBar.createCallback(),
      });
    } finally {
      progressBar.finish();
    }

    // Update context with download path
    postDownloadContext = {
      ...context,
      downloadPath: tarballPath,
    };

    // Run afterDownload hook if defined
    if (toolConfig.installParams?.hooks?.afterDownload) {
      logger.debug(logs.installer.debug.runningAfterDownloadHook());

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

    // Extract the tarball directly to install directory
    logger.debug(logs.installer.debug.extractingTarball());

    const extractResult: ExtractResult = await archiveExtractor.extract(tarballPath, {
      targetDir: context.installDir,
      stripComponents: params.stripComponents, // from CurlTarInstallParams
    });
    logger.debug(logs.installer.debug.tarballExtracted(), extractResult);

    // Update context with extract directory and result
    postExtractContext = {
      ...postDownloadContext,
      extractDir: context.installDir,
      extractResult,
    };

    // Run afterExtract hook if defined
    if (toolConfig.installParams?.hooks?.afterExtract) {
      logger.debug(logs.installer.debug.runningAfterExtractHook());

      const enhancedContext = hookExecutor.createEnhancedContext(postExtractContext, fs, logger);

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
    }

    // Handle all binaries from extracted archive
    await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, context.installDir, logger, extractResult);

    // Clean up downloaded tarball
    if (await toolFs.exists(tarballPath)) {
      logger.debug(logs.installer.debug.cleaningArchive(), tarballPath);
      await toolFs.rm(tarballPath);
    }

    // Return path to first binary for compatibility
    const primaryBinary = toolConfig.binaries?.[0] || toolName;
    const primaryBinaryPath = path.join(context.installDir, primaryBinary);

    return {
      success: true,
      binaryPath: primaryBinaryPath,
      info: {
        tarballUrl: url,
      },
    };
  } catch (error) {
    logger.error(logs.tool.error.installFailed('curl-tar', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
