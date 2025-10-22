import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { BaseInstallContext, ManualToolConfig } from '@types';
import { expandToolConfigPath } from '@utils';
import type { InstallOptions, InstallResult } from './IInstaller';
import { installerLogMessages } from './log-messages';
import { createToolFileSystem, getBinaryNames, getBinaryPaths, withInstallErrorHandling } from './utils';

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
): Promise<InstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installManually' });
  logger.debug(installerLogMessages.manual.installing(toolName));

  if (!toolConfig.installParams || !('binaryPath' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'Binary path not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const binaryPath = expandToolConfigPath(
    toolConfig.configFilePath,
    params.binaryPath as string,
    context.appConfig,
    context.systemInfo
  );

  const operation = async (): Promise<InstallResult> => {
    if (!(await toolFs.exists(binaryPath))) {
      return {
        success: false,
        error: `Binary not found at ${binaryPath}`,
      };
    }

    await installBinariesManually(toolConfig, toolName, context, toolFs, binaryPath, logger);

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      info: {
        manualInstall: true,
        originalPath: binaryPath,
      },
    };
  };

  return withInstallErrorHandling('manual', toolName, logger, operation) as Promise<InstallResult>;
}

async function installBinariesManually(
  toolConfig: ManualToolConfig,
  toolName: string,
  context: BaseInstallContext,
  toolFs: IFileSystem,
  binaryPath: string,
  logger: TsLogger
): Promise<void> {
  const binaryNames = getBinaryNames(toolConfig.binaries, toolName);

  for (const binaryName of binaryNames) {
    const finalBinaryPath = path.join(context.installDir, binaryName);

    if (binaryName === toolName || binaryNames.length === 1) {
      await toolFs.ensureDir(path.dirname(finalBinaryPath));
      await toolFs.copyFile(binaryPath, finalBinaryPath);
      await toolFs.chmod(finalBinaryPath, 0o755);
    } else {
      logger.debug(installerLogMessages.manual.multipleBinariesNotSupported(binaryName));
    }
  }
}
