import type { IInstallContext, Shell } from '@dotfiles/core';
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
import { resolveValue } from '@dotfiles/unwrap-value';
import { detectVersionViaCli } from '@dotfiles/utils';
import path from 'node:path';
import { messages } from './log-messages';
import type { CurlScriptToolConfig } from './schemas';
import type {
  CurlScriptInstallResult,
  ICurlScriptArgsContext,
  ICurlScriptInstallMetadata,
} from './types';

/**
 * Handles binary installation by copying from system directories to versioned directory
 */
async function handleBinaryInstallation(
  toolConfig: CurlScriptToolConfig,
  toolName: string,
  context: IInstallContext,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<void> {
  const binaryNames = getBinaryNames(toolConfig.binaries, toolName);

  for (const binaryName of binaryNames) {
    const finalBinaryPath = path.join(context.stagingDir, binaryName);

    if (await fs.exists(finalBinaryPath)) {
      logger.debug(messages.binaryFoundInInstallDir(finalBinaryPath));
      continue;
    }

    const sourcePath = path.join('/usr/local/bin', binaryName);

    if (await fs.exists(sourcePath)) {
      logger.debug(messages.movingBinary(sourcePath, finalBinaryPath));
      await fs.copyFile(sourcePath, finalBinaryPath);
      await fs.chmod(finalBinaryPath, 0o755);
    } else {
      logger.warn(messages.binaryNotFound(binaryName, `${context.stagingDir}, /usr/local/bin`));
    }
  }
}

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
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  shellExecutor: Shell,
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
    const scriptPath = path.join(context.stagingDir, `${toolName}-install.sh`);

    await downloadWithProgress(logger, url, scriptPath, `${toolName}-install.sh`, downloader, options);

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
      logger,
    );
    if (!afterDownloadResult.success) {
      return afterDownloadResult;
    }

    // Execute the script
    logger.debug(messages.executingScript(shell));

    const argsContext: ICurlScriptArgsContext = {
      projectConfig: context.projectConfig,
      scriptPath,
      stagingDir: context.stagingDir,
    };

    const resolvedArgs = params.args ? await resolveValue(argsContext, params.args) : [];
    const resolvedEnv = params.env ? await resolveValue(argsContext, params.env) : {};

    const env = {
      ...process.env,
      ...resolvedEnv,
    };

    if (shell === 'bash') {
      await shellExecutor`bash ${scriptPath} ${resolvedArgs}`.env(env).quiet();
    } else {
      await shellExecutor`sh ${scriptPath} ${resolvedArgs}`.env(env).quiet();
    }

    await handleBinaryInstallation(toolConfig, toolName, context, fs, logger);

    // Return paths to all binaries
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.stagingDir);

    let detectedVersion: string | undefined;
    const mainBinaryPath = binaryPaths[0];
    if (mainBinaryPath) {
      detectedVersion = await detectVersionViaCli({
        shellExecutor,
        binaryPath: mainBinaryPath,
        args: params.versionArgs,
        regex: params.versionRegex,
      });
    }

    const metadata: ICurlScriptInstallMetadata = {
      method: 'curl-script',
      scriptUrl: url,
      shell,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
      version: detectedVersion || (toolConfig.version !== 'latest' ? toolConfig.version : undefined),
    };
  };

  return withInstallErrorHandling('curl-script', toolName, logger, operation);
}
