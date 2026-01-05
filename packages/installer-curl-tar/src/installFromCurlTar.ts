import path from 'node:path';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IDownloadContext, IExtractContext, IExtractResult, IInstallContext } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, IInstallOptions } from '@dotfiles/installer';
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
import { detectVersionViaCli } from '@dotfiles/utils';
import { $ } from 'bun';
import { messages } from './log-messages';
import type { CurlTarToolConfig } from './schemas';
import type { CurlTarInstallResult, ICurlTarInstallMetadata } from './types';

type ShellExecutor = typeof $;

/**
 * Installs a tool from a tarball accessible via URL.
 *
 * This function orchestrates the complete installation process:
 * 1. Downloads the tarball from the specified URL
 * 2. Executes afterDownload hook if configured
 * 3. Extracts the archive to the installation directory
 * 4. Executes afterExtract hook if configured
 * 5. Sets up binary paths and creates necessary symlinks
 *
 * The function supports lifecycle hooks that allow custom processing at different
 * stages, such as modifying extracted files or setting permissions.
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the curl-tar tool.
 * @param context - The base installation context.
 * @param options - Optional installation options.
 * @param fs - The file system interface for file operations.
 * @param downloader - The downloader for fetching the tarball.
 * @param archiveExtractor - The archive extractor for unpacking.
 * @param hookExecutor - The hook executor for running lifecycle hooks.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @param shellExecutor - The shell executor function (defaults to Bun's $ operator).
 * @returns A promise that resolves to the installation result.
 */
export async function installFromCurlTar(
  toolName: string,
  toolConfig: CurlTarToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  shellExecutor: ShellExecutor = $
): Promise<CurlTarInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromCurlTar' });
  logger.debug(messages.installing(toolName));

  // Context variables for lifecycle stages
  let postDownloadContext: IDownloadContext;
  let postExtractContext: IExtractContext | undefined;

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
    const tarballPath = path.join(context.stagingDir, `${toolName}.tar.gz`);

    await downloadWithProgress(logger, url, tarballPath, `${toolName}.tar.gz`, downloader, options);

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

    const extractResult: IExtractResult = await archiveExtractor.extract(logger, tarballPath, {
      targetDir: context.stagingDir,
    });
    logger.debug(messages.tarballExtracted(), extractResult);

    // Update context with extract directory and result
    postExtractContext = {
      ...postDownloadContext,
      extractDir: context.stagingDir,
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
    await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, context.stagingDir, logger);

    // Clean up downloaded tarball
    if (await toolFs.exists(tarballPath)) {
      logger.debug(messages.cleaningArchive(tarballPath));
      await toolFs.rm(tarballPath);
    }

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.stagingDir);

    let detectedVersion: string | undefined;
    const mainBinaryPath = binaryPaths[0];
    if (mainBinaryPath) {
      detectedVersion = await detectVersionViaCli({
        binaryPath: mainBinaryPath,
        args: params.versionArgs,
        regex: params.versionRegex,
        shellExecutor,
      });
    }

    const metadata: ICurlTarInstallMetadata = {
      method: 'curl-tar',
      downloadUrl: url,
      tarballUrl: url,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
      version: detectedVersion || (toolConfig.version !== 'latest' ? toolConfig.version : undefined),
    };
  };

  return withInstallErrorHandling('curl-tar', toolName, logger, operation);
}
