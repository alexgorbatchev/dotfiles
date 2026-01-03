import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo, ToolConfig } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { InstallResult } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type {
  ICommandCompletionMeta,
  IGlobalProgram,
  IGlobalProgramOptions,
  InstallCommandSpecificOptions,
  IServices,
} from './types';

/**
 * Completion metadata for the install command.
 */
export const INSTALL_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'install',
  description: 'Install a tool if not already installed',
  hasPositionalArg: true,
  positionalArgDescription: 'tool name to install',
  positionalArgType: 'tool',
  options: [
    { flag: '--force', description: 'Force installation even if already installed' },
    { flag: '--shim-mode', description: 'Optimized output for shim usage' },
  ],
};

async function loadToolConfigSafely(
  logger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IResolvedFileSystem,
  projectConfig: ProjectConfig,
  configService: IConfigService,
  systemInfo: ISystemInfo
): Promise<ToolConfig | null> {
  const toolConfig = await configService.loadSingleToolConfig(
    logger,
    toolName,
    toolConfigsDir,
    fs,
    projectConfig,
    systemInfo
  );

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

function isConfigurationOnlyToolConfig(toolConfig: ToolConfig): boolean {
  const isManual = toolConfig.installationMethod === 'manual';
  const hasNoInstallParams = !toolConfig.installParams || Object.keys(toolConfig.installParams).length === 0;
  const hasNoBinaries = !toolConfig.binaries || toolConfig.binaries.length === 0;
  return isManual && hasNoInstallParams && hasNoBinaries;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  const message = typeof value === 'string' ? value : 'Unknown error';
  const error = new Error(message);
  return error;
}

async function executeInstallCommandAction(
  logger: TsLogger,
  toolName: string,
  combinedOptions: InstallCommandSpecificOptions & IGlobalProgramOptions,
  services: IServices
): Promise<number | null> {
  const { projectConfig, fs, installer, configService, generatorOrchestrator, systemInfo } = services;

  logger.debug(
    messages.commandActionStarted('install', toolName),
    projectConfig.paths.toolConfigsDir,
    fs.constructor.name
  );

  const toolConfig = await loadToolConfigSafely(
    logger,
    toolName,
    projectConfig.paths.toolConfigsDir,
    fs,
    projectConfig,
    configService,
    systemInfo
  );

  if (!toolConfig) {
    const result: number = 1;
    return result;
  }

  if (isConfigurationOnlyToolConfig(toolConfig)) {
    if (!combinedOptions.shimMode) {
      logger.info(messages.toolInstallSkippedConfigurationOnly(toolName));
    }

    const result: number | null = combinedOptions.shimMode ? 0 : null;
    return result;
  }

  const result = await installer.install(toolName, toolConfig, {
    force: combinedOptions.force,
    verbose: combinedOptions.verbose,
    shimMode: combinedOptions.shimMode,
  });

  if (result.success) {
    await generatorOrchestrator.generateCompletionsForTool(toolName, toolConfig, result.version);
  }

  const exitCode = handleInstallationResult(logger, result, toolName, combinedOptions.shimMode);
  return exitCode;
}

export function registerInstallCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerInstallCommand' });
  program
    .command('install <toolName>')
    .description('Installs a tool if it is not already installed. Typically called by shims.')
    .option('--force', 'Force installation even if the tool is already installed', false)
    .option('--shim-mode', 'Optimized output for shim usage: shows progress bars but suppresses log messages', false)
    .action(async (toolName: string, commandOptions: InstallCommandSpecificOptions) => {
      const combinedOptions: InstallCommandSpecificOptions & IGlobalProgramOptions = {
        ...commandOptions,
        ...program.opts(),
      };
      const services = await servicesFactory();
      let shouldExitWithCode: number | null = null;

      try {
        shouldExitWithCode = await executeInstallCommandAction(logger, toolName, combinedOptions, services);
      } catch (error) {
        const finalError = toError(error);
        shouldExitWithCode = handleInstallationError(logger, finalError, toolName, combinedOptions.shimMode);
      }

      if (shouldExitWithCode !== null) {
        exitCli(shouldExitWithCode);
      }
    });
}
