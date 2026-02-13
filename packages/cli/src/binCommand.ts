import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli, ExitCode, resolvePlatformConfig } from '@dotfiles/utils';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ICommandCompletionMeta, IGlobalProgram, IServices } from './types';

export const BIN_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'bin',
  description: 'Print the real path to a binary',
  hasPositionalArg: true,
  positionalArgDescription: 'binary name',
  positionalArgType: 'tool',
};

async function loadToolConfigByNameOrBinary(
  logger: TsLogger,
  nameOrBinary: string,
  toolConfigsDir: string,
  fs: IResolvedFileSystem,
  projectConfig: ProjectConfig,
  configService: IConfigService,
  systemInfo: ISystemInfo,
): Promise<{ toolName: string; binaryName: string; } | undefined> {
  const toolConfig = await configService.loadSingleToolConfig(
    logger,
    nameOrBinary,
    toolConfigsDir,
    fs,
    projectConfig,
    systemInfo,
  );

  if (toolConfig) {
    const resolved = resolvePlatformConfig(toolConfig, systemInfo);
    const binaries = resolved.binaries ?? [];
    const firstBinary = binaries[0];
    const binaryName = firstBinary
      ? (typeof firstBinary === 'string' ? firstBinary : firstBinary.name)
      : nameOrBinary;
    return { toolName: nameOrBinary, binaryName };
  }

  const binaryLookupResult = await configService.loadToolConfigByBinary(
    logger,
    nameOrBinary,
    toolConfigsDir,
    fs,
    projectConfig,
    systemInfo,
  );

  if (binaryLookupResult && !('error' in binaryLookupResult)) {
    return { toolName: binaryLookupResult.name, binaryName: nameOrBinary };
  }

  return undefined;
}

async function executeBinCommandAction(
  logger: TsLogger,
  nameOrBinary: string,
  services: IServices,
): Promise<ExitCode> {
  const { projectConfig, fs, configService, systemInfo } = services;

  // Use a silent logger (minLevel above FATAL=6) to suppress all output
  // from config loading, which may log validation errors for unrelated tools
  const silentLogger = logger.getSubLogger({ minLevel: 7 });

  const result = await loadToolConfigByNameOrBinary(
    silentLogger,
    nameOrBinary,
    projectConfig.paths.toolConfigsDir,
    fs,
    projectConfig,
    configService,
    systemInfo,
  );

  if (!result) {
    return ExitCode.ERROR;
  }

  const { toolName, binaryName } = result;
  const binaryPath = path.join(projectConfig.paths.binariesDir, toolName, 'current', binaryName);

  try {
    const resolvedPath = await realpath(binaryPath);
    process.stdout.write(resolvedPath);
    return ExitCode.SUCCESS;
  } catch {
    return ExitCode.ERROR;
  }
}

export function registerBinCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerBinCommand' });

  program
    .command('bin <name>')
    .description(
      'Print the absolute real path to a binary (resolving symlinks). Accepts tool name or binary name (from .bin()).',
    )
    .action(async (name: string) => {
      const services = await servicesFactory();
      const exitCode = await executeBinCommandAction(logger, name, services);
      exitCli(exitCode);
    });
}
