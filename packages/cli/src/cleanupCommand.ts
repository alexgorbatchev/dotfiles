import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { FileOperation, IFileRegistry } from '@dotfiles/registry/file';
import { contractHomePath, exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { CleanupCommandSpecificOptions, GlobalProgram, GlobalProgramOptions, Services } from './types';

async function cleanupAllTrackedFiles(
  logger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  homeDir: string,
  dryRun: boolean
): Promise<void> {
  logger.info(messages.cleanupAllTrackedFiles());

  const allTools = await fileRegistry.getRegisteredTools();
  for (const toolName of allTools) {
    await cleanupToolFiles(logger, fs, fileRegistry, toolName, homeDir, undefined, dryRun);
  }

  if (!dryRun) {
    for (const toolName of allTools) {
      await fileRegistry.removeToolOperations(toolName);
    }
    logger.info(messages.cleanupRegistryDatabase());
  } else {
    logger.info(messages.cleanupRegistryDryRun());
  }
}

async function cleanupSpecificTool(
  logger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  toolName: string,
  homeDir: string,
  fileType: string | undefined,
  dryRun: boolean
): Promise<void> {
  logger.info(messages.cleanupToolFiles(toolName));
  await cleanupToolFiles(logger, fs, fileRegistry, toolName, homeDir, fileType, dryRun);

  if (!dryRun) {
    await fileRegistry.removeToolOperations(toolName);
    logger.info(messages.cleanupRegistryTool(toolName, false));
  } else {
    logger.info(messages.cleanupRegistryTool(toolName, true));
  }
}

async function cleanupSpecificType(
  logger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  fileType: string,
  homeDir: string,
  dryRun: boolean
): Promise<void> {
  logger.info(messages.cleanupTypeFiles(fileType));
  const operations = await fileRegistry.getOperations({ fileType: fileType as FileOperation['fileType'] });

  for (const operation of operations) {
    const fileState = await fileRegistry.getFileState(operation.filePath);
    if (fileState && fileState.lastOperation !== 'rm') {
      await removeFile(logger, fs, operation.filePath, homeDir, dryRun);
    }
  }
}

async function registryBasedCleanup(
  logger: TsLogger,
  services: Services,
  options: CleanupCommandSpecificOptions & GlobalProgramOptions
): Promise<void> {
  const { fs, fileRegistry } = services;
  const { dryRun, tool, type, all } = options;
  const homeDir = services.projectConfig.paths.homeDir;

  if (all) {
    await cleanupAllTrackedFiles(logger, fs, fileRegistry, homeDir, dryRun);
  } else if (tool) {
    await cleanupSpecificTool(logger, fs, fileRegistry, tool, homeDir, type, dryRun);
  } else if (type) {
    await cleanupSpecificType(logger, fs, fileRegistry, type, homeDir, dryRun);
  } else {
    logger.warn(
      messages.configParameterIgnored(
        'cleanup options',
        'Registry-based cleanup requires --all, --tool <name>, or --type <type> option'
      )
    );
  }
}

async function cleanupToolFiles(
  logger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  toolName: string,
  homeDir: string,
  fileType?: string,
  dryRun?: boolean
): Promise<void> {
  const fileStates = await fileRegistry.getFileStatesForTool(toolName);

  let filteredStates = fileStates;
  if (fileType) {
    filteredStates = fileStates.filter((state) => state.fileType === fileType);
  }

  logger.trace(messages.cleanupFoundFiles(filteredStates.length, toolName, fileType));

  for (const fileState of filteredStates) {
    if (fileState.lastOperation !== 'rm') {
      // For symlinks, remove the symlink (targetPath), not the original file (filePath)
      const pathToRemove =
        fileState.fileType === 'symlink' && fileState.targetPath ? fileState.targetPath : fileState.filePath;
      await removeFile(logger, fs, pathToRemove, homeDir, dryRun || false);
    }
  }
}

async function removeFile(
  logger: TsLogger,
  fs: IFileSystem,
  filePath: string,
  homeDir: string,
  dryRun?: boolean
): Promise<void> {
  try {
    if (await fs.exists(filePath)) {
      if (!dryRun) {
        await fs.rm(filePath, { force: true });
        logger.info(messages.cleanupFileRemoved(contractHomePath(homeDir, filePath)));
      } else {
        logger.info(messages.fileCleanupDryRun(filePath));
      }
    } else {
      logger.debug(messages.cleanupFileNotFound(filePath));
    }
  } catch (error) {
    logger.error(messages.cleanupDeleteFailed(filePath), error);
  }
}

async function cleanupActionLogic(
  logger: TsLogger,
  options: CleanupCommandSpecificOptions & GlobalProgramOptions,
  services: Services
): Promise<void> {
  const { dryRun, tool, type, all } = options;

  try {
    logger.trace(messages.cleanupProcessStarted(dryRun), options);
    logger.info(
      dryRun
        ? messages.operationStarted('dry run cleanup (no files will be removed)')
        : messages.operationStarted('cleanup')
    );

    // Use registry-based cleanup (default behavior is now --all)
    const cleanupOptions = { ...options, all: all || (!tool && !type) };
    await registryBasedCleanup(logger, services, cleanupOptions);

    logger.info(dryRun ? messages.operationCompleted('Dry run cleanup') : messages.operationCompleted('Cleanup'));
    logger.trace(messages.cleanupProcessFinished(dryRun));
  } catch (error) {
    logger.error(messages.commandExecutionFailed('cleanup', 1), error);
    exitCli(1);
  }
}

export function registerCleanupCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCleanupCommand' });
  program
    .command('cleanup')
    .description('Remove all generated artifacts, including shims, shell configurations, and the .generated directory.')
    .option('--tool <name>', 'Remove files for specific tool only (registry-based)')
    .option('--type <type>', 'Remove files of specific type only (registry-based)')
    .option('--all', 'Remove all tracked files (registry-based)')
    .action(async (options: CleanupCommandSpecificOptions) => {
      const combinedOptions: CleanupCommandSpecificOptions & GlobalProgramOptions = { ...options, ...program.opts() };
      logger.debug(messages.commandActionCalled('cleanup'));
      const services = await servicesFactory();
      await cleanupActionLogic(logger, combinedOptions, services);
    });
}
