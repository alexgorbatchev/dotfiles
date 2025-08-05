import { exitCli } from '@modules/cli/exitCli';
import { type TsLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
import { ErrorTemplates, WarningTemplates, SuccessTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';

export interface CleanupCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  tool?: string;
  type?: string;
  all?: boolean;
  registry?: boolean;
}

async function registryBasedCleanup(
  parentLogger: TsLogger,
  services: Services,
  options: CleanupCommandOptions,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'registryBasedCleanup' });
  const { fs, fileRegistry } = services;
  const { dryRun, tool, type, all } = options;

  if (all) {
    // Remove all tracked files
    logger.info(SuccessTemplates.general.cleanupAllTrackedFiles());
    const allTools = await fileRegistry.getRegisteredTools();
    
    for (const toolName of allTools) {
      await cleanupToolFiles(logger, fs, fileRegistry, toolName, undefined, dryRun);
    }
    
    // Clean up the registry database itself
    if (!dryRun) {
      logger.info(SuccessTemplates.general.cleanupRegistryDatabase());
      // We don't actually delete the registry DB, just compact it
      // await fileRegistry.compact();
    } else {
      logger.info(SuccessTemplates.general.cleanupRegistryDryRun());
    }
    
  } else if (tool) {
    // Remove files for specific tool
    logger.info(SuccessTemplates.general.cleanupToolFiles(tool));
    await cleanupToolFiles(logger, fs, fileRegistry, tool, type, dryRun);
    
    if (!dryRun) {
      await fileRegistry.removeToolOperations(tool);
      logger.info(SuccessTemplates.general.cleanupRegistryTool(tool, false));
    } else {
      logger.info(SuccessTemplates.general.cleanupRegistryTool(tool, true));
    }
    
  } else if (type) {
    // Remove files of specific type across all tools
    logger.info(SuccessTemplates.general.cleanupTypeFiles(type));
    const operations = await fileRegistry.getOperations({ fileType: type as any });
    
    for (const operation of operations) {
      const fileState = await fileRegistry.getFileState(operation.filePath);
      if (fileState && fileState.lastOperation !== 'delete') {
        await removeFile(logger, fs, operation.filePath, dryRun);
      }
    }
  } else {
    logger.warn(WarningTemplates.config.ignored('cleanup options', 'Registry-based cleanup requires --all, --tool <name>, or --type <type> option'));
  }
}

async function cleanupToolFiles(
  logger: TsLogger,
  fs: any,
  fileRegistry: any,
  toolName: string,
  fileType?: string,
  dryRun?: boolean,
): Promise<void> {
  const fileStates = await fileRegistry.getFileStatesForTool(toolName);
  
  const filteredStates = fileType
    ? fileStates.filter((state: any) => state.fileType === fileType)
    : fileStates;
  
  logger.trace(DebugTemplates.command.foundFiles(filteredStates.length, toolName, fileType));
  
  for (const fileState of filteredStates) {
    await removeFile(logger, fs, fileState.filePath, dryRun);
    
    if (fileState.targetPath) {
      await removeFile(logger, fs, fileState.targetPath, dryRun);
    }
  }
}

async function removeFile(
  logger: TsLogger,
  fs: any,
  filePath: string,
  dryRun?: boolean,
): Promise<void> {
  try {
    if (await fs.exists(filePath)) {
      if (!dryRun) {
        await fs.rm(filePath, { force: true });
        logger.info(SuccessTemplates.fs.removed('cleanup', filePath));
      } else {
        logger.info(SuccessTemplates.general.fileCleanupDryRun(filePath));
      }
    } else {
      logger.debug(DebugTemplates.command.fileNotFound(filePath));
    }
  } catch (error) {
    logger.error(ErrorTemplates.fs.deleteFailed(filePath, String(error)));
  }
}

async function cleanupActionLogic(
  parentLogger: TsLogger,
  options: CleanupCommandOptions,
  services: Services,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'cleanupActionLogic' });
  const { yamlConfig, fs } = services;
  const { dryRun, tool, type, all, registry } = options;

  try {
    logger.trace(DebugTemplates.command.cleanupStarted(dryRun), options);
    logger.info(
      dryRun ? SuccessTemplates.general.started('dry run cleanup (no files will be removed)') : SuccessTemplates.general.started('cleanup'),
    );

    // If registry-based options are specified, use registry cleanup
    if (registry || tool || type || all) {
      await registryBasedCleanup(logger, services, options);
      return;
    }

    // Otherwise, fall back to legacy manifest-based cleanup

    let manifest: GeneratedArtifactsManifest | null = null;

    try {
      logger.debug(DebugTemplates.command.manifestRead());
      if (await fs.exists(yamlConfig.paths.manifestPath)) {
        const manifestContent = await fs.readFile(yamlConfig.paths.manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
        logger.debug(DebugTemplates.command.manifestRead());
      } else {
        logger.debug(DebugTemplates.command.manifestMissing());
        logger.warn(WarningTemplates.fs.notFound('Manifest file', yamlConfig.paths.manifestPath));
      }
    } catch (error) {
      logger.debug(DebugTemplates.command.manifestError(), String(error));
      logger.error(ErrorTemplates.fs.readFailed('manifest file', String(error)));
      logger.warn(WarningTemplates.config.ignored('manifest file', 'proceeding to delete generated directory despite manifest error'));
    }

    if (manifest) {
      // Delete shims
      if (manifest.shims && manifest.shims.length > 0) {
        logger.info(SuccessTemplates.general.cleanupShimDeletion());
        for (const shimPath of manifest.shims) {
          try {
            if (await fs.exists(shimPath)) {
              if (!dryRun) {
                await fs.rm(shimPath, { force: true });
                logger.info(SuccessTemplates.fs.removed('cleanup', `shim: ${shimPath}`));
                logger.debug(DebugTemplates.command.shimDeletion(shimPath, true, false));
              } else {
                logger.info(SuccessTemplates.general.fileCleanupDryRun(shimPath));
                logger.debug(DebugTemplates.command.shimDeletion(shimPath, true, true));
              }
            } else {
              logger.warn(WarningTemplates.fs.notFound('Shim', shimPath));
              logger.debug(DebugTemplates.command.shimNotFound(shimPath));
            }
          } catch (error) {
            logger.error(ErrorTemplates.fs.deleteFailed(shimPath, String(error)));
            logger.debug(DebugTemplates.command.shimDeletion(shimPath, false, false), String(error));
          }
        }
      }

      // Delete shell init file
      if (manifest.shellInit?.path) {
        logger.info(SuccessTemplates.general.cleanupShellInitDeletion());
        try {
          if (await fs.exists(manifest.shellInit.path)) {
            if (!dryRun) {
              await fs.rm(manifest.shellInit.path, { force: true });
              logger.info(SuccessTemplates.fs.removed('cleanup', `shell init: ${manifest.shellInit.path}`));
              logger.debug(DebugTemplates.command.shellInitDeletion(manifest.shellInit.path, true, false));
            } else {
              logger.info(SuccessTemplates.general.fileCleanupDryRun(manifest.shellInit.path));
              logger.debug(DebugTemplates.command.shellInitDeletion(manifest.shellInit.path, true, true));
            }
          } else {
            logger.warn(WarningTemplates.fs.notFound('Shell init file', manifest.shellInit.path));
            logger.debug(DebugTemplates.command.shellInitNotFound(manifest.shellInit.path));
          }
        } catch (error) {
          logger.error(ErrorTemplates.fs.deleteFailed(manifest.shellInit.path, String(error)));
          logger.debug(DebugTemplates.command.shellInitDeletion(manifest.shellInit.path, false, false), String(error));
        }
      }

      // Delete symlinks
      if (manifest.symlinks && manifest.symlinks.length > 0) {
        logger.info(SuccessTemplates.general.cleanupSymlinkDeletion());
        for (const symlinkOp of manifest.symlinks) {
          try {
            if (await fs.lstat(symlinkOp.targetPath).catch(() => null)) {
              // Check if path exists (could be symlink or regular file if broken)
              if (!dryRun) {
                await fs.rm(symlinkOp.targetPath, { force: true });
                logger.info(SuccessTemplates.fs.removed('cleanup', `symlink: ${symlinkOp.targetPath}`));
                logger.debug(DebugTemplates.command.symlinkDeletion(symlinkOp.targetPath, true, false));
              } else {
                logger.info(SuccessTemplates.general.fileCleanupDryRun(symlinkOp.targetPath));
                logger.debug(DebugTemplates.command.symlinkDeletion(symlinkOp.targetPath, true, true));
              }
            } else {
              logger.warn(WarningTemplates.fs.notFound('Symlink target', symlinkOp.targetPath));
              logger.debug(DebugTemplates.command.symlinkNotFound(symlinkOp.targetPath));
            }
          } catch (error) {
            logger.error(ErrorTemplates.fs.deleteFailed(symlinkOp.targetPath, String(error)));
            logger.debug(DebugTemplates.command.symlinkDeletion(symlinkOp.targetPath, false, false), String(error));
          }
        }
      }
    }

    // Delete the entire .generated directory
    try {
      logger.debug(DebugTemplates.command.fileDeletion(yamlConfig.paths.generatedDir, true, false));
      if (await fs.exists(yamlConfig.paths.generatedDir)) {
        if (!dryRun) {
          await fs.rm(yamlConfig.paths.generatedDir, { recursive: true, force: true });
          logger.info(
            SuccessTemplates.fs.removedDirectory('cleanup', yamlConfig.paths.generatedDir),
          );
          logger.debug(DebugTemplates.command.fileDeletion(yamlConfig.paths.generatedDir, true, false));
        } else {
          logger.info(SuccessTemplates.general.directoryCleanupInfo(yamlConfig.paths.generatedDir, true, true));
          logger.debug(DebugTemplates.command.fileDeletion(yamlConfig.paths.generatedDir, true, true));
        }
      } else {
        logger.info(SuccessTemplates.general.directoryCleanupInfo(yamlConfig.paths.generatedDir, false, false));
        logger.debug(DebugTemplates.command.fileNotFound(yamlConfig.paths.generatedDir));
      }
    } catch (error) {
      logger.error(ErrorTemplates.fs.deleteFailed(yamlConfig.paths.generatedDir, String(error)));
      logger.debug(DebugTemplates.command.fileDeletion(yamlConfig.paths.generatedDir, false, false), String(error));
    }

    logger.info(dryRun ? SuccessTemplates.general.completed('Dry run cleanup') : SuccessTemplates.general.completed('Cleanup'));
    logger.trace(DebugTemplates.command.cleanupFinished(dryRun));
  } catch (error) {
    logger.error(ErrorTemplates.command.executionFailed('cleanup', 1, (error as Error).message));
    logger.debug(DebugTemplates.command.errorDetails(), error);
    exitCli(1);
  }
}

export function registerCleanupCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCleanupCommand' });
  program
    .command('cleanup')
    .description(
      'Remove all generated artifacts, including shims, shell configurations, and the .generated directory.',
    )
    .option('--tool <name>', 'Remove files for specific tool only (registry-based)')
    .option('--type <type>', 'Remove files of specific type only (registry-based)')
    .option('--all', 'Remove all tracked files (registry-based)')
    .option('--registry', 'Use registry-based cleanup instead of manifest-based')
    .action(async (options) => {
      const combinedOptions: CleanupCommandOptions = { ...options, ...program.opts() };

      logger.debug(DebugTemplates.command.actionCalled('cleanup'), combinedOptions);
      const services = await servicesFactory();
      await cleanupActionLogic(logger, combinedOptions, services);
    });
}