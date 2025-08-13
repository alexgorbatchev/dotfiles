import type { GlobalProgram, Services } from '@cli';
import { exitCli } from '@modules/cli/exitCli';
import type { FileOperation, FileState, IFileRegistry } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system';
import { logs, type TsLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import { contractHomePath } from '@utils';

export interface CleanupCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  tool?: string;
  type?: string;
  all?: boolean;
  registry?: boolean;
}

async function cleanupAllTrackedFiles(
  logger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  homeDir: string,
  dryRun: boolean
): Promise<void> {
  logger.info(logs.general.success.cleanupAllTrackedFiles());
  const allTools = await fileRegistry.getRegisteredTools();

  for (const toolName of allTools) {
    await cleanupToolFiles(logger, fs, fileRegistry, toolName, homeDir, undefined, dryRun);
  }

  // Clean up the registry database itself
  if (!dryRun) {
    logger.info(logs.general.success.cleanupRegistryDatabase());
    await fileRegistry.compact();
  } else {
    logger.info(logs.general.success.cleanupRegistryDryRun());
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
  logger.info(logs.general.success.cleanupToolFiles(toolName));
  await cleanupToolFiles(logger, fs, fileRegistry, toolName, homeDir, fileType, dryRun);

  if (!dryRun) {
    await fileRegistry.removeToolOperations(toolName);
    logger.info(logs.general.success.cleanupRegistryTool(toolName, false));
  } else {
    logger.info(logs.general.success.cleanupRegistryTool(toolName, true));
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
  logger.info(logs.general.success.cleanupTypeFiles(fileType));
  const operations = await fileRegistry.getOperations({ fileType: fileType as FileOperation['fileType'] });

  for (const operation of operations) {
    const fileState = await fileRegistry.getFileState(operation.filePath);
    if (fileState && fileState.lastOperation !== 'rm') {
      await removeFile(logger, fs, operation.filePath, homeDir, dryRun);
    }
  }
}

async function registryBasedCleanup(
  parentLogger: TsLogger,
  services: Services,
  options: CleanupCommandOptions
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'registryBasedCleanup' });
  const { fs, fileRegistry } = services;
  const { dryRun, tool, type, all } = options;
  const homeDir = services.yamlConfig.paths.homeDir;

  if (all) {
    await cleanupAllTrackedFiles(logger, fs, fileRegistry, homeDir, dryRun);
  } else if (tool) {
    await cleanupSpecificTool(logger, fs, fileRegistry, tool, homeDir, type, dryRun);
  } else if (type) {
    await cleanupSpecificType(logger, fs, fileRegistry, type, homeDir, dryRun);
  } else {
    logger.warn(
      logs.config.warning.ignored(
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

  const filteredStates = fileType ? fileStates.filter((state: FileState) => state.fileType === fileType) : fileStates;

  logger.trace(logs.command.debug.foundFiles(filteredStates.length, toolName, fileType));

  for (const fileState of filteredStates) {
    await removeFile(logger, fs, fileState.filePath, homeDir, dryRun);

    if (fileState.targetPath) {
      await removeFile(logger, fs, fileState.targetPath, homeDir, dryRun);
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
        logger.info(logs.fs.success.removed('cleanup', contractHomePath(homeDir, filePath)));
      } else {
        logger.info(logs.general.success.fileCleanupDryRun(filePath));
      }
    } else {
      logger.debug(logs.command.debug.fileNotFound(filePath));
    }
  } catch (error) {
    logger.error(logs.fs.error.deleteFailed(filePath, String(error)));
  }
}

async function loadManifest(
  logger: TsLogger,
  fs: IFileSystem,
  manifestPath: string
): Promise<GeneratedArtifactsManifest | null> {
  try {
    logger.debug(logs.command.debug.manifestRead());
    if (await fs.exists(manifestPath)) {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
      logger.debug(logs.command.debug.manifestRead());
      return manifest;
    } else {
      logger.debug(logs.command.debug.manifestMissing());
      logger.warn(logs.fs.warning.notFound('Manifest file', manifestPath));
      return null;
    }
  } catch (error) {
    logger.debug(logs.command.debug.manifestError(), String(error));
    logger.error(logs.fs.error.readFailed('manifest file', String(error)));
    logger.warn(
      logs.config.warning.ignored('manifest file', 'proceeding to delete generated directory despite manifest error')
    );
    return null;
  }
}

async function deleteFileWithLogging(
  logger: TsLogger,
  fs: IFileSystem,
  filePath: string,
  fileType: string,
  dryRun: boolean,
  homeDir: string,
  debugSuccess: (path: string, success: boolean, dryRun: boolean) => void,
  debugNotFound: (path: string) => void
): Promise<void> {
  try {
    if (await fs.exists(filePath)) {
      if (!dryRun) {
        await fs.rm(filePath, { force: true });
        logger.info(logs.fs.success.removed('cleanup', contractHomePath(homeDir, filePath)));
        debugSuccess(filePath, true, false);
      } else {
        logger.info(logs.general.success.fileCleanupDryRun(filePath));
        debugSuccess(filePath, true, true);
      }
    } else {
      logger.warn(logs.fs.warning.notFound(fileType, filePath));
      debugNotFound(filePath);
    }
  } catch (error) {
    logger.error(logs.fs.error.deleteFailed(filePath, String(error)));
    debugSuccess(filePath, false, false);
  }
}

async function cleanupShims(
  logger: TsLogger,
  fs: IFileSystem,
  shims: string[],
  dryRun: boolean,
  homeDir: string
): Promise<void> {
  logger.info(logs.general.success.cleanupShimDeletion());
  for (const shimPath of shims) {
    await deleteFileWithLogging(
      logger,
      fs,
      shimPath,
      'Shim',
      dryRun,
      homeDir,
      logs.command.debug.shimDeletion,
      logs.command.debug.shimNotFound
    );
  }
}

async function cleanupShellInit(
  logger: TsLogger,
  fs: IFileSystem,
  shellInitPath: string,
  dryRun: boolean,
  homeDir: string
): Promise<void> {
  logger.info(logs.general.success.cleanupShellInitDeletion());
  await deleteFileWithLogging(
    logger,
    fs,
    shellInitPath,
    'Shell init file',
    dryRun,
    homeDir,
    logs.command.debug.shellInitDeletion,
    logs.command.debug.shellInitNotFound
  );
}

async function cleanupSymlinks(
  logger: TsLogger,
  fs: IFileSystem,
  symlinks: Array<{ targetPath: string }>,
  dryRun: boolean,
  homeDir: string
): Promise<void> {
  logger.info(logs.general.success.cleanupSymlinkDeletion());
  for (const symlinkOp of symlinks) {
    try {
      if (await fs.lstat(symlinkOp.targetPath).catch(() => null)) {
        if (!dryRun) {
          await fs.rm(symlinkOp.targetPath, { force: true });
          logger.info(logs.fs.success.removed('cleanup', contractHomePath(homeDir, symlinkOp.targetPath)));
          logger.debug(logs.command.debug.symlinkDeletion(symlinkOp.targetPath, true, false));
        } else {
          logger.info(logs.general.success.fileCleanupDryRun(symlinkOp.targetPath));
          logger.debug(logs.command.debug.symlinkDeletion(symlinkOp.targetPath, true, true));
        }
      } else {
        logger.warn(logs.fs.warning.notFound('Symlink target', symlinkOp.targetPath));
        logger.debug(logs.command.debug.symlinkNotFound(symlinkOp.targetPath));
      }
    } catch (error) {
      logger.error(logs.fs.error.deleteFailed(symlinkOp.targetPath, String(error)));
      logger.debug(logs.command.debug.symlinkDeletion(symlinkOp.targetPath, false, false), String(error));
    }
  }
}

async function cleanupGeneratedDirectory(
  logger: TsLogger,
  fs: IFileSystem,
  generatedDir: string,
  dryRun: boolean,
  homeDir: string
): Promise<void> {
  try {
    logger.debug(logs.command.debug.fileDeletion(generatedDir, true, false));
    if (await fs.exists(generatedDir)) {
      if (!dryRun) {
        await fs.rm(generatedDir, { recursive: true, force: true });
        logger.info(logs.fs.success.removed('cleanup', contractHomePath(homeDir, generatedDir)));
        logger.debug(logs.command.debug.fileDeletion(generatedDir, true, false));
      } else {
        logger.info(logs.general.success.directoryCleanupInfo(generatedDir, true, true));
        logger.debug(logs.command.debug.fileDeletion(generatedDir, true, true));
      }
    } else {
      logger.info(logs.general.success.directoryCleanupInfo(generatedDir, false, false));
      logger.debug(logs.command.debug.fileNotFound(generatedDir));
    }
  } catch (error) {
    logger.error(logs.fs.error.deleteFailed(generatedDir, String(error)));
    logger.debug(logs.command.debug.fileDeletion(generatedDir, false, false), String(error));
  }
}

async function performManifestBasedCleanup(
  logger: TsLogger,
  services: Services,
  manifest: GeneratedArtifactsManifest | null,
  dryRun: boolean
): Promise<void> {
  const { fs, yamlConfig } = services;
  const homeDir = yamlConfig.paths.homeDir;

  if (manifest) {
    // Delete shims
    if (manifest.shims && manifest.shims.length > 0) {
      await cleanupShims(logger, fs, manifest.shims, dryRun, homeDir);
    }

    // Delete shell init file
    if (manifest.shellInit?.path) {
      await cleanupShellInit(logger, fs, manifest.shellInit.path, dryRun, homeDir);
    }

    // Delete symlinks
    if (manifest.symlinks && manifest.symlinks.length > 0) {
      await cleanupSymlinks(logger, fs, manifest.symlinks, dryRun, homeDir);
    }
  }

  // Delete the entire .generated directory
  await cleanupGeneratedDirectory(logger, fs, yamlConfig.paths.generatedDir, dryRun, homeDir);
}

async function cleanupActionLogic(
  parentLogger: TsLogger,
  options: CleanupCommandOptions,
  services: Services
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'cleanupActionLogic' });
  const { yamlConfig } = services;
  const { dryRun, tool, type, all, registry } = options;

  try {
    logger.trace(logs.command.debug.cleanupStarted(dryRun), options);
    logger.info(
      dryRun
        ? logs.general.success.started('dry run cleanup (no files will be removed)')
        : logs.general.success.started('cleanup')
    );

    // If registry-based options are specified, use registry cleanup
    if (registry || tool || type || all) {
      await registryBasedCleanup(logger, services, options);
      return;
    }

    // Otherwise, fall back to legacy manifest-based cleanup
    const manifest = await loadManifest(logger, services.fs, yamlConfig.paths.manifestPath);
    await performManifestBasedCleanup(logger, services, manifest, dryRun);

    logger.info(dryRun ? logs.general.success.completed('Dry run cleanup') : logs.general.success.completed('Cleanup'));
    logger.trace(logs.command.debug.cleanupFinished(dryRun));
  } catch (error) {
    logger.error(logs.command.error.executionFailed('cleanup', 1, (error as Error).message));
    logger.debug(logs.command.debug.errorDetails(), error);
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
    .option('--registry', 'Use registry-based cleanup instead of manifest-based')
    .action(async (options) => {
      const combinedOptions: CleanupCommandOptions = { ...options, ...program.opts() };

      logger.debug(logs.command.debug.actionCalled('cleanup'), combinedOptions);
      const services = await servicesFactory();
      await cleanupActionLogic(logger, combinedOptions, services);
    });
}
