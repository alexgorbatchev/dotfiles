import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, BrewToolConfig } from '@dotfiles/schemas';
import { $ } from 'bun';
import type { InstallOptions, InstallResult } from '../types';
import { getBinaryPaths, withInstallErrorHandling } from '../utils';
import { messages } from '../utils/log-messages';

type ShellExecutor = typeof $;

/**
 * Install a tool using Homebrew
 */
export async function installFromBrew(
  toolName: string,
  toolConfig: BrewToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: ShellExecutor = $
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromBrew' });
  logger.debug(messages.brew.installing(toolName), toolConfig.installParams);

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
    await executeBrewInstall(formula, isCask, tap, options?.force, logger, shellExecutor);
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    const result: InstallResult = {
      success: true,
      binaryPaths,
      info: {
        formula,
        isCask,
        tap,
      },
    };

    return result;
  };

  return withInstallErrorHandling('brew', toolName, logger, operation);
}

async function executeBrewInstall(
  formula: string,
  isCask: boolean,
  tap: string | string[] | undefined,
  force: boolean | undefined,
  logger: TsLogger,
  $: ShellExecutor
): Promise<void> {
  // Add taps if specified
  if (tap) {
    const taps = Array.isArray(tap) ? tap : [tap];
    for (const t of taps) {
      const tapCommand = `brew tap ${t}`;
      logger.debug(messages.brew.executingCommand(tapCommand));
      await $`brew tap ${t}`.quiet();
    }
  }

  // Build install command
  const installArgs = ['install'];
  if (isCask) {
    installArgs.push('--cask');
  }
  if (force) {
    installArgs.push('--force');
  }
  installArgs.push(formula);

  const installCommand = `brew ${installArgs.join(' ')}`;
  logger.debug(messages.brew.executingCommand(installCommand));

  // Execute the install command
  await $`brew ${installArgs}`.quiet();
}
