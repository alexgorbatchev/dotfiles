import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, BrewToolConfig } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';

/**
 * Install a tool using Homebrew
 */
export async function installFromBrew(
  toolName: string,
  toolConfig: BrewToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromBrew' });
  logger.debug(logs.installer.debug.installingFromBrew(), toolName, toolConfig.installParams);

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
    const command = buildBrewCommand(formula, isCask, tap, options?.force);
    logger.debug(logs.installer.debug.executingCommand(), command);

    await installBinaries(toolConfig, toolName, context, logger);

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
    logger.error(logs.tool.error.installFailed('brew', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildBrewCommand(
  formula: string,
  isCask: boolean,
  tap: string | string[] | undefined,
  force?: boolean
): string {
  const brewCommand = 'brew';
  let command = `${brewCommand} `;

  if (tap) {
    const taps = Array.isArray(tap) ? tap : [tap];
    for (const t of taps) {
      command += `tap ${t} && ${brewCommand} `;
    }
  }

  command += isCask ? 'install --cask ' : 'install ';
  command += formula;

  if (force) {
    command += ' --force';
  }

  return command;
}

async function installBinaries(
  toolConfig: BrewToolConfig,
  toolName: string,
  context: BaseInstallContext,
  logger: TsLogger
): Promise<void> {
  const binaryNames = toolConfig.binaries || [toolName];
  for (const binaryName of binaryNames) {
    const sourcePath = `/usr/local/bin/${binaryName}`;
    const finalBinaryPath = path.join(context.installDir, binaryName);
    logger.debug(logs.installer.debug.movingBinary(), sourcePath, finalBinaryPath);
  }
}
