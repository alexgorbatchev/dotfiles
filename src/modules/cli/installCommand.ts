import type { GlobalProgram, Services } from '@cli';
import type { YamlConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import { logs, type TsLogger } from '@modules/logger';
import type { ToolConfig } from '@types';
import { exitCli } from './exitCli';

async function loadToolConfigSafely(
  logger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<ToolConfig | null> {
  const toolConfig = await loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);

  if (!toolConfig) {
    logger.error(logs.tool.error.notFound(toolName, toolConfigsDir));
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
      logger.info(logs.tool.success.installed(toolName, result.version || 'unknown', 'CLI'));
      return null; // Don't exit on success in normal mode
    }
  } else {
    logger.debug(logs.command.debug.actionStarted('install-failed', toolName), result.error);

    if (shimMode) {
      // In shim mode, output user-friendly error message to stderr
      console.error(`Failed to install '${toolName}': ${result.error || 'Unknown error'}`);
      return 1;
    } else {
      // Normal mode: use logger
      logger.error(logs.tool.error.installFailed('unknown', toolName, result.error || 'Unknown error'));
      return 1;
    }
  }
}

function handleInstallationError(logger: TsLogger, error: Error, toolName: string, shimMode: boolean): number {
  logger.debug(logs.command.debug.unhandledError(), error);

  if (shimMode) {
    // In shim mode, output user-friendly error message to stderr
    console.error(`Failed to install '${toolName}': ${error.message}`);
    return 1;
  } else {
    // Normal mode: use logger
    logger.error(logs.command.error.executionFailed('install', 1, error.message));
    return 1;
  }
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
    .option('--shim-mode', 'Optimized output for shim usage: shows errors but suppresses success messages', false)
    .action(async (toolName, options) => {
      const combinedOptions = { ...options, ...program.opts() };
      logger.debug(logs.command.debug.actionCalled('install', toolName), combinedOptions);

      const services = await servicesFactory();
      const { yamlConfig, fs, installer } = services;

      let shouldExitWithCode: number | null = null;

      try {
        logger.debug(
          logs.command.debug.actionStarted('install', toolName),
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
