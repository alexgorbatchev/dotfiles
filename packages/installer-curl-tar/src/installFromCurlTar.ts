import path from 'node:path';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type {
  BaseInstallContext,
  ExtractResult,
  PostDownloadInstallContext,
  PostExtractInstallContext,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, InstallOptions } from '@dotfiles/installer';
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  executeAfterExtractHook,
  getBinaryPaths,
  setupBinariesFromArchive,
  withInstallErrorHandling,
} from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import type { CurlTarToolConfig } from './schemas';
import type { CurlTarInstallMetadata, CurlTarInstallResult } from './types';

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
): Promise<CurlTarInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromCurlTar' });
  logger.debug(messages.installing(toolName));

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

  const operation = async (): Promise<CurlTarInstallResult> => {
    // Download the tarball
    logger.debug(messages.downloadingTarball(url));
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
    logger.debug(messages.extractingTarball());

    const extractResult: ExtractResult = await archiveExtractor.extract(tarballPath, {
      targetDir: context.installDir,
    });
    logger.debug(messages.tarballExtracted(), extractResult);

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
      logger.debug(messages.cleaningArchive(tarballPath));
      await toolFs.rm(tarballPath);
    }

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    const metadata: CurlTarInstallMetadata = {
      method: 'curl-tar',
      downloadUrl: url,
      tarballUrl: url,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
    };
  };

  return withInstallErrorHandling('curl-tar', toolName, logger, operation);
}
