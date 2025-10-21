import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import type { BaseInstallContext, BrewToolConfig } from '@types';
import type { InstallOptions, InstallResult } from './IInstaller';
import { getBinaryPaths, withInstallErrorHandling } from './utils';
import { installerLogMessages } from './log-messages';

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
  logger.debug(installerLogMessages.brew.installing(toolName), toolConfig.installParams);

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

  const operation = async (): Promise<InstallResult> => {
    const command = buildBrewCommand(formula, isCask, tap, options?.force);
    logger.debug(installerLogMessages.brew.executingCommand(command));

    await installBinaries(toolConfig, toolName, context, logger);

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      info: {
        formula,
        isCask,
        tap,
      },
    };
  };

  return withInstallErrorHandling('brew', toolName, logger, operation) as Promise<InstallResult>;
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
  const binaries = toolConfig.binaries || [toolName];
  for (const binary of binaries) {
    const binaryName = typeof binary === 'string' ? binary : binary.name;
    const sourcePath = `/usr/local/bin/${binaryName}`;
    const finalBinaryPath = path.join(context.installDir, binaryName);
    logger.debug(installerLogMessages.binaryMovement.moving(sourcePath, finalBinaryPath));
  }
}
