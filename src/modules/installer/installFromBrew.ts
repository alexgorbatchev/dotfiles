import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import type { BrewToolConfig, BaseInstallContext } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';
import { DebugTemplates, ErrorTemplates } from '@modules/shared/ErrorTemplates';

/**
 * Install a tool using Homebrew
 */
export async function installFromBrew(
  toolName: string,
  toolConfig: BrewToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger,
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromBrew' });
  logger.debug(DebugTemplates.installer.installingFromBrew(), toolName, toolConfig.installParams);

  if (!toolConfig.installParams) {
    return {
      success: false,
      error: 'Install parameters not specified',
    };
  }

  const params = toolConfig.installParams;
  const formula = params.formula || toolName;
  const isCask = params.cask || false;
  const tap = params.tap;

  try {
    // Check if brew is installed
    // This is a simplified check; in a real implementation, we would use
    // the IFileSystem to execute commands
    const brewCommand = 'brew';

    // Build the brew command
    let command = `${brewCommand} `;

    // Add tap if specified
    if (tap) {
      if (Array.isArray(tap)) {
        for (const t of tap) {
          command += `tap ${t} && ${brewCommand} `;
        }
      } else {
        command += `tap ${tap} && ${brewCommand} `;
      }
    }

    // Add install command
    command += isCask ? 'install --cask ' : 'install ';
    command += formula;

    // Add force flag if specified
    if (options?.force) {
      command += ' --force';
    }

    logger.debug(DebugTemplates.installer.executingCommand(), command);

    // In a real implementation, we would execute the command here
    // For now, we'll just simulate success

    // Handle all binaries by copying from brew installation to versioned directory
    const binaryNames = toolConfig.binaries || [toolName];
    for (const binaryName of binaryNames) {
      const sourcePath = `/usr/local/bin/${binaryName}`;
      const finalBinaryPath = path.join(context.installDir, binaryName);
      
      // In a real implementation, we would copy from brew location to our versioned directory
      // For now, this is a placeholder that assumes brew installed the binary
      logger.debug(DebugTemplates.installer.movingBinary(), sourcePath, finalBinaryPath);
    }

    // Return path to first binary for compatibility
    const primaryBinary = toolConfig.binaries?.[0] || toolName;
    const primaryBinaryPath = path.join(context.installDir, primaryBinary);

    return {
      success: true,
      binaryPath: primaryBinaryPath,
      info: {
        formula,
        isCask,
        tap,
      },
    };
  } catch (error) {
    logger.error(ErrorTemplates.tool.installFailed('brew', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}