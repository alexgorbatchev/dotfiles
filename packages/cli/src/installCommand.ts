import type { YamlConfig } from '@dotfiles/config';
import { loadSingleToolConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ToolConfig } from '@dotfiles/schemas';
import { exitCli } from '@dotfiles/utils';
import { cliLogMessages } from './log-messages';
import type { GlobalProgram, Services } from './types';

export interface InstallCommandOptions {
  force: boolean;
  shimMode: boolean;
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

async function loadToolConfigSafely(
  logger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<ToolConfig | null> {
  const toolConfig = await loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);

  if (!toolConfig) {
    logger.error(cliLogMessages.toolNotFound(toolName, toolConfigsDir));
    return null;
  }

  return toolConfig;
}

function handleInstallationResult(
  logger: TsLogger,
  result: { success: boolean; version?: string; error?: string },
  toolName: string,
  shimMode: boolean
): number | null {
  if (result.success) {
    if (shimMode) {
      // In shim mode, exit silently on success
      return 0;
    } else {
      // Normal mode: log success message and continue (don't exit)
      logger.info(cliLogMessages.toolInstalled(toolName, result.version ?? 'unknown', 'CLI'));
      return null; // Don't exit on success in normal mode
    }
  } else {
    logger.debug(cliLogMessages.commandActionStarted('install-failed', toolName), result.error);

    if (shimMode) {
      // In shim mode, output user-friendly error message to stderr only
      process.stderr.write(`Failed to install '${toolName}': ${result.error ?? 'Unknown error'}\n`);
    } else {
      // Normal mode: use logger only
      logger.error(cliLogMessages.toolInstallFailed('unknown', toolName, result.error ?? 'Unknown error'));
    }
    return 1;
  }
}

function handleInstallationError(logger: TsLogger, error: Error, toolName: string, shimMode: boolean): number {
  logger.debug(cliLogMessages.commandUnhandledError(), error);

  if (shimMode) {
    // In shim mode, output user-friendly error message to stderr only
    process.stderr.write(`Failed to install '${toolName}': ${error.message}\n`);
  } else {
    // Normal mode: use logger only
    logger.error(cliLogMessages.commandExecutionFailed('install', 1, error.message));
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
    // biome-ignore lint/suspicious/noExplicitAny: Commander action callback types are not properly typed
    .action(async (toolName: string, _options: any) => {
      const combinedOptions: InstallCommandOptions = { ..._options, ...program.opts() } as InstallCommandOptions;
      logger.debug(cliLogMessages.commandActionCalled('install', toolName), combinedOptions);

      const services = await servicesFactory();
      const { yamlConfig, fs, installer } = services;

      let shouldExitWithCode: number | null = null;

      try {
        logger.debug(
          cliLogMessages.commandActionStarted('install', toolName),
          yamlConfig.paths.toolConfigsDir,
          fs.constructor.name
        );

        const toolConfig = await loadToolConfigSafely(
          logger,
          toolName,
          yamlConfig.paths.toolConfigsDir,
          fs,
          yamlConfig
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

          shouldExitWithCode = handleInstallationResult(logger, result, toolName, combinedOptions.shimMode);
        }
      } catch (error) {
        shouldExitWithCode = handleInstallationError(logger, error as Error, toolName, combinedOptions.shimMode);
      }

      if (shouldExitWithCode !== null) {
        exitCli(shouldExitWithCode);
      }
    });
}
