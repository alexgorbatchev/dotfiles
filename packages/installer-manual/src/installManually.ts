import path from 'node:path';
import type { BaseInstallContext } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IInstallOptions } from '@dotfiles/installer';
import { createToolFileSystem, getBinaryNames, getBinaryPaths, withInstallErrorHandling } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { expandToolConfigPath } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { ManualToolConfig } from './schemas';
import type { IManualInstallMetadata, ManualInstallResult } from './types';

/**
 * Installs a manually managed tool.
 *
 * This function verifies that the specified binary exists at the configured path,
 * copies it to the installation directory, and sets the appropriate permissions.
 * If no binary path is specified, it creates a placeholder installation record.
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the manual tool.
 * @param context - The base installation context.
 * @param _options - Optional installation options (currently unused).
 * @param fs - The file system interface for file operations.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @returns A promise that resolves to the installation result.
 */
export async function installManually(
  toolName: string,
  toolConfig: ManualToolConfig,
  context: BaseInstallContext,
  _options: IInstallOptions | undefined,
  fs: IFileSystem,
  parentLogger: TsLogger
): Promise<ManualInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installManually' });
  logger.debug(messages.installing(toolName));

  const params = toolConfig.installParams;

  const operation = async (): Promise<ManualInstallResult> => {
    let binaryPaths: string[] = [];

    // Handle binary installation if binaryPath is specified
    if (params?.binaryPath) {
      const binaryPath = expandToolConfigPath(
        toolConfig.configFilePath,
        params.binaryPath,
        context.projectConfig,
        context.systemInfo
      );

      if (!(await toolFs.exists(binaryPath))) {
        return {
          success: false,
          error: `Binary not found at ${binaryPath}`,
        };
      }

      await installBinariesManually(toolConfig, toolName, context, toolFs, binaryPath, logger);
      binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);
    }

    const metadata: IManualInstallMetadata = {
      method: 'manual',
      manualInstall: true,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
    };
  };

  return withInstallErrorHandling('manual', toolName, logger, operation);
}

/**
 * Copies manually installed binaries to the installation directory.
 *
 * This function handles copying the binary file from its source location to the
 * installation directory and setting executable permissions. For tools with multiple
 * binaries, only the primary binary (matching the tool name) is currently supported.
 *
 * @param toolConfig - The configuration for the manual tool.
 * @param toolName - The name of the tool being installed.
 * @param context - The base installation context.
 * @param toolFs - The file system interface scoped to this tool.
 * @param binaryPath - The source path of the binary to install.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @returns A promise that resolves when binary installation is complete.
 */
async function installBinariesManually(
  toolConfig: ManualToolConfig,
  toolName: string,
  context: BaseInstallContext,
  toolFs: IFileSystem,
  binaryPath: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'installBinariesManually' });
  const binaryNames = getBinaryNames(toolConfig.binaries, toolName);

  for (const binaryName of binaryNames) {
    const finalBinaryPath = path.join(context.installDir, binaryName);

    if (binaryName === toolName || binaryNames.length === 1) {
      await toolFs.ensureDir(path.dirname(finalBinaryPath));
      await toolFs.copyFile(binaryPath, finalBinaryPath);
      await toolFs.chmod(finalBinaryPath, 0o755);
    } else {
      logger.debug(messages.multipleBinariesNotSupported());
    }
  }
}
