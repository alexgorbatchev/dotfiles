import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import { logs, type TsLogger } from '@modules/logger';
import type { GlobalProgram, Services } from '../../cli';
import { exitCli } from './exitCli';

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
        const toolConfig = await loadSingleToolConfig(
          logger,
          toolName,
          yamlConfig.paths.toolConfigsDir,
          fs,
          yamlConfig
        );
        // Tool configuration loaded, proceeding with installation

        if (!toolConfig) {
          logger.error(logs.tool.error.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          shouldExitWithCode = 1;
        } else {
          // Starting installation process
          const result = await installer.install(toolName, toolConfig, {
            force: combinedOptions.force,
            verbose: combinedOptions.verbose,
          });

          if (result.success) {
            // Installation successful
            if (combinedOptions.shimMode) {
              // In shim mode, exit silently on success
              shouldExitWithCode = 0;
            } else {
              // Normal mode: log success message
              logger.info(logs.tool.success.installed(toolName, result.version || 'unknown', 'CLI'));
            }
          } else {
            logger.debug(logs.command.debug.actionStarted('install-failed', toolName), result.error);

            if (combinedOptions.shimMode) {
              // In shim mode, output user-friendly error message to stderr
              // NOTE: Using console.error instead of logger here because shims need clean,
              // unformatted error messages for end users (no timestamps, log levels, etc.)
              console.error(`Failed to install '${toolName}': ${result.error || 'Unknown error'}`);
              shouldExitWithCode = 1;
            } else {
              // Normal mode: use logger
              logger.error(logs.tool.error.installFailed('unknown', toolName, result.error || 'Unknown error'));
              shouldExitWithCode = 1;
            }
          }
        }
      } catch (error) {
        logger.debug(logs.command.debug.unhandledError(), error);

        if (combinedOptions.shimMode) {
          // In shim mode, output user-friendly error message to stderr
          // NOTE: Using console.error instead of logger here because shims need clean,
          // unformatted error messages for end users (no timestamps, log levels, etc.)
          console.error(`Failed to install '${toolName}': ${(error as Error).message}`);
          shouldExitWithCode = 1;
        } else {
          // Normal mode: use logger
          logger.error(logs.command.error.executionFailed('install', 1, (error as Error).message));
          shouldExitWithCode = 1;
        }
      }

      if (shouldExitWithCode !== null) {
        exitCli(shouldExitWithCode);
      }
    });
}
