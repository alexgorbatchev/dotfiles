import path from 'node:path';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
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
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  executeAfterExtractHook,
  getBinaryPaths,
  withInstallErrorHandling,
} from './utils';
import { installerLogMessages } from './log-messages';

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
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromCurlTar' });
  logger.debug(installerLogMessages.curlTar.installing(toolName));

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

  const operation = async (): Promise<InstallResult> => {
    // Download the tarball
  logger.debug(installerLogMessages.curlTar.downloadingTarball(url));
    const tarballPath = path.join(context.installDir, `${toolName}.tar.gz`);

    await downloadWithProgress(url, tarballPath, `${toolName}.tar.gz`, downloader, options);

    // Update context with download path
    postDownloadContext = {
      ...context,
      downloadPath: tarballPath,
    };

    // Run afterDownload hook if defined
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

    // Extract the tarball directly to install directory
    logger.debug(installerLogMessages.curlTar.extractingTarball());

    const extractResult: ExtractResult = await archiveExtractor.extract(tarballPath, {
      targetDir: context.installDir,
    });
    logger.debug(installerLogMessages.curlTar.tarballExtracted(), extractResult);

    // Update context with extract directory and result
    postExtractContext = {
      ...postDownloadContext,
      extractDir: context.installDir,
      extractResult,
    };

    // Run afterExtract hook if defined
    const afterExtractResult = await executeAfterExtractHook(toolConfig, postExtractContext, hookExecutor, fs, logger);
    if (!afterExtractResult.success) {
      return {
        success: false,
        error: afterExtractResult.error,
      };
    }

    // Handle all binaries from extracted archive
    await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, context.installDir, logger);

    // Clean up downloaded tarball
    if (await toolFs.exists(tarballPath)) {
  logger.debug(installerLogMessages.curlTar.cleaningArchive(tarballPath));
      await toolFs.rm(tarballPath);
    }

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      info: {
        tarballUrl: url,
      },
    };
  };

  return withInstallErrorHandling('curl-tar', toolName, logger, operation) as Promise<InstallResult>;
}
