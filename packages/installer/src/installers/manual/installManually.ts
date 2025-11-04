import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, ManualToolConfig } from '@dotfiles/schemas';
import { expandToolConfigPath } from '@dotfiles/utils';
import type { InstallOptions } from '../../types';
import { createToolFileSystem, getBinaryNames, getBinaryPaths, withInstallErrorHandling } from '../../utils';
import { messages } from './log-messages';
import type { ManualInstallMetadata, ManualInstallResult } from './types';

/**
 * Install a tool manually
 */
export async function installManually(
  toolName: string,
  toolConfig: ManualToolConfig,
  context: BaseInstallContext,
  _options: InstallOptions | undefined,
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
        context.appConfig,
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

    const metadata: ManualInstallMetadata = {
      method: 'manual',
      manualInstall: true,
      originalPath: params?.binaryPath || null,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
    };
  };

  return withInstallErrorHandling('manual', toolName, logger, operation);
}

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
      logger.debug(messages.multipleBinariesNotSupported(binaryName));
    }
  }
}
