import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { InstallResult } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { BaseCommandOptions, GlobalProgram, InstallCommandSpecificOptions, Services } from './types';

export interface InstallCommandOptions extends BaseCommandOptions {
  force: boolean;
  shimMode: boolean;
}

async function loadToolConfigSafely(
  logger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig,
  configService: IConfigService
): Promise<ToolConfig | null> {
  const toolConfig = await configService.loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);

  if (!toolConfig) {
    logger.error(messages.toolNotFound(toolName, toolConfigsDir));
    return null;
  }

  return toolConfig;
}

function handleInstallationResult(
  logger: TsLogger,
  result: InstallResult,
  toolName: string,
  shimMode: boolean
): number | null {
  if (result.success) {
    if (shimMode) {
      // In shim mode, exit silently on success
      return 0;
    } else {
      // Normal mode: log success message and continue (don't exit)
      const actualMethod = result.installationMethod ?? 'unknown';
      logger.info(messages.toolInstalled(toolName, result.version ?? 'unknown', actualMethod));
      return null; // Don't exit on success in normal mode
    }
  } else {
    if (shimMode) {
      // In shim mode, output user-friendly error message to stderr only
      process.stderr.write(`Failed to install '${toolName}': ${result.error ?? 'Unknown error'}\n`);
    } else {
      // Normal mode: use logger only
      const failedMethod = result.installationMethod ?? 'unknown';
      logger.error(messages.toolInstallFailed(failedMethod, toolName, result.error ?? 'Unknown error'));
    }
    return 1;
  }
}

function handleInstallationError(logger: TsLogger, error: Error, toolName: string, shimMode: boolean): number {
  if (shimMode) {
    // In shim mode, output user-friendly error message to stderr only
    process.stderr.write(`Failed to install '${toolName}': ${error.message}\n`);
  } else {
    // Normal mode: use logger only
    logger.error(messages.commandExecutionFailed('install', 1), error);
  }
  return 1;
}

export function registerInstallCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerInstallCommand' });
  program
    .command('install <toolName>')
    .description('Installs a tool if it is not already installed. Typically called by shims.')
    .option('--force', 'Force installation even if the tool is already installed', false)
    .option('--shim-mode', 'Optimized output for shim usage: shows progress bars but suppresses log messages', false)
    .action(async (toolName: string, commandOptions: InstallCommandSpecificOptions) => {
      const combinedOptions: InstallCommandOptions = { ...commandOptions, ...program.opts() };
      logger.debug(messages.commandActionCalled('install'));

      const services = await servicesFactory();
      const { yamlConfig, fs, installer, configService } = services;

      let shouldExitWithCode: number | null = null;

      try {
        logger.debug(
          messages.commandActionStarted('install', toolName),
          yamlConfig.paths.toolConfigsDir,
          fs.constructor.name
        );

        const toolConfig = await loadToolConfigSafely(
          logger,
          toolName,
          yamlConfig.paths.toolConfigsDir,
          fs,
          yamlConfig,
          configService
        );

        if (!toolConfig) {
          shouldExitWithCode = 1;
        } else {
          // Starting installation process
          const result = await installer.install(toolName, toolConfig, {
            force: combinedOptions.force,
            verbose: combinedOptions.verbose,
            shimMode: combinedOptions.shimMode,
          });

          shouldExitWithCode = handleInstallationResult(
            logger,
            result,
            toolName,
            combinedOptions.shimMode
          );
        }
      } catch (error) {
        shouldExitWithCode = handleInstallationError(logger, error as Error, toolName, combinedOptions.shimMode);
      }

      if (shouldExitWithCode !== null) {
        exitCli(shouldExitWithCode);
      }
    });
}
