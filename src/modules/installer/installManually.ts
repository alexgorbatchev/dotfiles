import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import { expandToolConfigPath } from '@utils';
import { TrackedFileSystem } from '@modules/file-registry';
import type { ManualToolConfig, BaseInstallContext } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';

/**
 * Install a tool manually
 */
export async function installManually(
  toolName: string,
  toolConfig: ManualToolConfig,
  context: BaseInstallContext,
  _options: InstallOptions | undefined,
  fs: IFileSystem,
  parentLogger: TsLogger,
): Promise<InstallResult> {
  // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
  const toolFs = fs instanceof TrackedFileSystem 
    ? fs.withToolName(toolName)
    : fs;

  const logger = parentLogger.getSubLogger({ name: 'installManually' });
  logger.debug(logs.installer.debug.installingManually(), toolName);

  if (!toolConfig.installParams || !('binaryPath' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'Binary path not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const rawBinaryPath = params.binaryPath as string;
  const binaryPath = expandToolConfigPath(toolConfig.configFilePath, rawBinaryPath, context.appConfig, context.systemInfo);

  try {
    // Check if the binary exists
    if (await toolFs.exists(binaryPath)) {
      // Handle all binaries by creating symlinks or copies to versioned directory
      const binaryNames = toolConfig.binaries || [toolName];
      for (const binaryName of binaryNames) {
        const finalBinaryPath = path.join(context.installDir, binaryName);
        
        // For manual installation, we create a symlink to the original binary
        // or copy it if the original path is specific to this binary
        if (binaryName === toolName || binaryNames.length === 1) {
          // Use the provided binaryPath for the primary binary or if only one binary
          await toolFs.ensureDir(path.dirname(finalBinaryPath));
          await toolFs.copyFile(binaryPath, finalBinaryPath);
          await toolFs.chmod(finalBinaryPath, 0o755);
        } else {
          // For additional binaries, they would need to be specified separately
          // This is a limitation of the current manual installation approach
          logger.debug(logs.installer.debug.manualMultipleBinariesNotSupported(), binaryName);
        }
      }

      // Return path to first binary for compatibility
      const primaryBinary = toolConfig.binaries?.[0] || toolName;
      const primaryBinaryPath = path.join(context.installDir, primaryBinary);

      return {
        success: true,
        binaryPath: primaryBinaryPath,
        info: {
          manualInstall: true,
          originalPath: binaryPath,
        },
      };
    } else {
      return {
        success: false,
        error: `Binary not found at ${binaryPath}`,
      };
    }
  } catch (error) {
    logger.error(logs.tool.error.installFailed('manual', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}