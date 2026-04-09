import { type IDownloadContext, type IInstallContext, type IShell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor, IInstallOptions } from "@dotfiles/installer";
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  getBinaryPaths,
  setupBinariesFromDirectDownload,
  withInstallErrorHandling,
} from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { detectVersionViaCli } from "@dotfiles/utils";
import path from "node:path";
import { messages } from "./log-messages";
import type { CurlBinaryToolConfig } from "./schemas";
import type { CurlBinaryInstallResult, ICurlBinaryInstallMetadata } from "./types";

/**
 * Installs a tool by downloading a standalone binary file from a URL.
 *
 * This function orchestrates the complete installation process:
 * 1. Downloads the binary from the specified URL
 * 2. Executes afterDownload hook if configured
 * 3. Makes the binary executable
 * 4. Sets up binary paths and creates necessary entrypoints
 *
 * Unlike curl-tar, there is no archive extraction step — the downloaded file
 * is used directly as the binary.
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the curl-binary tool.
 * @param context - The base installation context.
 * @param options - Optional installation options.
 * @param fs - The file system interface for file operations.
 * @param downloader - The downloader for fetching the binary.
 * @param hookExecutor - The hook executor for running lifecycle hooks.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @param shellExecutor - The shell executor function.
 * @returns A promise that resolves to the installation result.
 */
export async function installFromCurlBinary(
  toolName: string,
  toolConfig: CurlBinaryToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  shellExecutor: IShell,
): Promise<CurlBinaryInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: "installFromCurlBinary" });
  logger.debug(messages.installing(toolName));

  if (!toolConfig.installParams || !("url" in toolConfig.installParams)) {
    return {
      success: false,
      error: "URL not specified in installParams",
    };
  }

  const params = toolConfig.installParams;
  const url = params.url;

  const operation = async (): Promise<CurlBinaryInstallResult> => {
    // Download the binary directly to the staging directory
    logger.debug(messages.downloadingBinary(url));
    const binaryPath = path.join(context.stagingDir, toolName);

    await downloadWithProgress(logger, url, binaryPath, toolName, downloader, options);
    logger.debug(messages.binaryDownloaded());

    // Update context with download path
    const postDownloadContext: IDownloadContext = {
      ...context,
      downloadPath: binaryPath,
    };

    // Run afterDownload hook if defined
    const afterDownloadResult = await executeAfterDownloadHook(
      toolConfig,
      postDownloadContext,
      hookExecutor,
      fs,
      logger,
    );
    if (!afterDownloadResult.success) {
      return {
        success: false,
        error: afterDownloadResult.error,
      };
    }

    // Make binary executable and set up binary entrypoints
    logger.debug(messages.settingPermissions());
    await setupBinariesFromDirectDownload(toolFs, toolName, toolConfig, context, binaryPath, logger);

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, context.stagingDir);

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

    const metadata: ICurlBinaryInstallMetadata = {
      method: "curl-binary",
      downloadUrl: url,
      binaryUrl: url,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
      version: detectedVersion || (toolConfig.version !== "latest" ? toolConfig.version : undefined),
    };
  };

  return withInstallErrorHandling("curl-binary", toolName, logger, operation);
}
