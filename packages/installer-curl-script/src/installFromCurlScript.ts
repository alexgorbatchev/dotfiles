import path from 'node:path';
import { shell as bunShell } from './shell';
import type { InstallContext } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, IInstallOptions } from '@dotfiles/installer';
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  getBinaryNames,
  getBinaryPaths,
  withInstallErrorHandling,
} from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import type { CurlScriptToolConfig } from './schemas';
import type { CurlScriptInstallResult, ICurlScriptInstallMetadata } from './types';

/**
 * Installs a tool using a curl script.
 *
 * This function downloads an installation script from the specified URL, makes it
 * executable, and runs it using the configured shell. The script is responsible for
 * installing the tool to the system. After execution, the function attempts to locate
 * the installed binaries and create the necessary symlinks.
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the curl-script tool.
 * @param context - The base installation context.
 * @param options - Optional installation options.
 * @param fs - The file system interface for file operations.
 * @param downloader - The downloader for fetching the installation script.
 * @param hookExecutor - The hook executor for running post-download hooks.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @returns A promise that resolves to the installation result.
 */
export async function installFromCurlScript(
  toolName: string,
  toolConfig: CurlScriptToolConfig,
  context: InstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<CurlScriptInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromCurlScript' });
  logger.debug(messages.installing(toolName));

  if (!toolConfig.installParams || !('url' in toolConfig.installParams) || !('shell' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'URL or shell not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const url = params.url;
  const shell = params.shell;

  const operation = async (): Promise<CurlScriptInstallResult> => {
    // Download the script
    logger.debug(messages.downloadingScript(url));
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
      return afterDownloadResult;
    }

    // Execute the script
    logger.debug(messages.executingScript(shell));

    const args = params.args ?? [];
    const env = {
      ...process.env,
      ...params.env,
      INSTALL_DIR: context.installDir,
    };

    if (shell === 'bash') {
      await bunShell`bash ${scriptPath} ${args}`.env(env).quiet();
    } else {
      await bunShell`sh ${scriptPath} ${args}`.env(env).quiet();
    }

    // Handle all binaries by copying from script installation to versioned directory
    const binaryNames = getBinaryNames(toolConfig.binaries, toolName);
    for (const binaryName of binaryNames) {
      const finalBinaryPath = path.join(context.installDir, binaryName);

      // If binary already exists in installDir (script installed it there), we are good
      if (await fs.exists(finalBinaryPath)) {
        logger.debug(messages.binaryFoundInInstallDir(finalBinaryPath));
        continue;
      }

      const sourcePath = path.join('/usr/local/bin', binaryName);

      if (await fs.exists(sourcePath)) {
        logger.debug(messages.movingBinary(sourcePath, finalBinaryPath));
        // Copy and remove to handle cross-device moves safely
        await fs.copyFile(sourcePath, finalBinaryPath);
        await fs.chmod(finalBinaryPath, 0o755);
        // Optional: remove source? Maybe not, as it might be shared or system-wide.
        // But if we don't remove it, next time we might pick it up again?
        // The goal is to have a versioned install.
        // If the script installs to /usr/local/bin, it's a system install.
        // We are trying to capture it into our versioned dir.
        // If we leave it there, it might conflict or be used by others.
        // But we probably shouldn't delete from /usr/local/bin unless we are sure.
        // Let's leave it for now, or maybe try to remove it if we own it?
        // Given the user intent is "dotfiles management", we probably want to own the binary.
        // But deleting from /usr/local/bin might require sudo which we might not have.
        // So let's just copy.
      } else {
        logger.warn(messages.binaryNotFound(binaryName, `/usr/local/bin, ${context.installDir}`));
      }
    }

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    const metadata: ICurlScriptInstallMetadata = {
      method: 'curl-script',
      scriptUrl: url,
      shell,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
      version: toolConfig.version !== 'latest' ? toolConfig.version : undefined,
    };
  };

  return withInstallErrorHandling('curl-script', toolName, logger, operation);
}
