import { exitCli } from '@modules/cli/exitCli';
import { type TsLogger, logs } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
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
    logger.info(logs.general.success.cleanupAllTrackedFiles());
    const allTools = await fileRegistry.getRegisteredTools();
    
    for (const toolName of allTools) {
      await cleanupToolFiles(logger, fs, fileRegistry, toolName, services.yamlConfig.paths.homeDir, undefined, dryRun);
    }
    
    // Clean up the registry database itself
    if (!dryRun) {
      logger.info(logs.general.success.cleanupRegistryDatabase());
      // We don't actually delete the registry DB, just compact it
      // await fileRegistry.compact();
    } else {
      logger.info(logs.general.success.cleanupRegistryDryRun());
    }
    
  } else if (tool) {
    // Remove files for specific tool
    logger.info(logs.general.success.cleanupToolFiles(tool));
    await cleanupToolFiles(logger, fs, fileRegistry, tool, services.yamlConfig.paths.homeDir, type, dryRun);
    
    if (!dryRun) {
      await fileRegistry.removeToolOperations(tool);
      logger.info(logs.general.success.cleanupRegistryTool(tool, false));
    } else {
      logger.info(logs.general.success.cleanupRegistryTool(tool, true));
    }
    
  } else if (type) {
    // Remove files of specific type across all tools
    logger.info(logs.general.success.cleanupTypeFiles(type));
    const operations = await fileRegistry.getOperations({ fileType: type as any });
    
    for (const operation of operations) {
      const fileState = await fileRegistry.getFileState(operation.filePath);
      if (fileState && fileState.lastOperation !== 'rm') {
        await removeFile(logger, fs, operation.filePath, services.yamlConfig.paths.homeDir, dryRun);
      }
    }
  } else {
    logger.warn(logs.config.warning.ignored('cleanup options', 'Registry-based cleanup requires --all, --tool <name>, or --type <type> option'));
  }
}

async function cleanupToolFiles(
  logger: TsLogger,
  fs: any,
  fileRegistry: any,
  toolName: string,
  homeDir: string,
  fileType?: string,
  dryRun?: boolean,
): Promise<void> {
  const fileStates = await fileRegistry.getFileStatesForTool(toolName);
  
  const filteredStates = fileType
    ? fileStates.filter((state: any) => state.fileType === fileType)
    : fileStates;
  
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
  fs: any,
  filePath: string,
  homeDir: string,
  dryRun?: boolean,
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

async function cleanupActionLogic(
  parentLogger: TsLogger,
  options: CleanupCommandOptions,
  services: Services,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'cleanupActionLogic' });
  const { yamlConfig, fs } = services;
  const { dryRun, tool, type, all, registry } = options;

  try {
    logger.trace(logs.command.debug.cleanupStarted(dryRun), options);
    logger.info(
      dryRun ? logs.general.success.started('dry run cleanup (no files will be removed)') : logs.general.success.started('cleanup'),
    );

    // If registry-based options are specified, use registry cleanup
    if (registry || tool || type || all) {
      await registryBasedCleanup(logger, services, options);
      return;
    }

    // Otherwise, fall back to legacy manifest-based cleanup

    let manifest: GeneratedArtifactsManifest | null = null;

    try {
      logger.debug(logs.command.debug.manifestRead());
      if (await fs.exists(yamlConfig.paths.manifestPath)) {
        const manifestContent = await fs.readFile(yamlConfig.paths.manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
        logger.debug(logs.command.debug.manifestRead());
      } else {
        logger.debug(logs.command.debug.manifestMissing());
        logger.warn(logs.fs.warning.notFound('Manifest file', yamlConfig.paths.manifestPath));
      }
    } catch (error) {
      logger.debug(logs.command.debug.manifestError(), String(error));
      logger.error(logs.fs.error.readFailed('manifest file', String(error)));
      logger.warn(logs.config.warning.ignored('manifest file', 'proceeding to delete generated directory despite manifest error'));
    }

    if (manifest) {
      // Delete shims
      if (manifest.shims && manifest.shims.length > 0) {
        logger.info(logs.general.success.cleanupShimDeletion());
        for (const shimPath of manifest.shims) {
          try {
            if (await fs.exists(shimPath)) {
              if (!dryRun) {
                await fs.rm(shimPath, { force: true });
                logger.info(logs.fs.success.removed('cleanup', contractHomePath(services.yamlConfig.paths.homeDir, shimPath)));
                logger.debug(logs.command.debug.shimDeletion(shimPath, true, false));
              } else {
                logger.info(logs.general.success.fileCleanupDryRun(shimPath));
                logger.debug(logs.command.debug.shimDeletion(shimPath, true, true));
              }
            } else {
              logger.warn(logs.fs.warning.notFound('Shim', shimPath));
              logger.debug(logs.command.debug.shimNotFound(shimPath));
            }
          } catch (error) {
            logger.error(logs.fs.error.deleteFailed(shimPath, String(error)));
            logger.debug(logs.command.debug.shimDeletion(shimPath, false, false), String(error));
          }
        }
      }

      // Delete shell init file
      if (manifest.shellInit?.path) {
        logger.info(logs.general.success.cleanupShellInitDeletion());
        try {
          if (await fs.exists(manifest.shellInit.path)) {
            if (!dryRun) {
              await fs.rm(manifest.shellInit.path, { force: true });
              logger.info(logs.fs.success.removed('cleanup', contractHomePath(services.yamlConfig.paths.homeDir, manifest.shellInit.path)));
              logger.debug(logs.command.debug.shellInitDeletion(manifest.shellInit.path, true, false));
            } else {
              logger.info(logs.general.success.fileCleanupDryRun(manifest.shellInit.path));
              logger.debug(logs.command.debug.shellInitDeletion(manifest.shellInit.path, true, true));
            }
          } else {
            logger.warn(logs.fs.warning.notFound('Shell init file', manifest.shellInit.path));
            logger.debug(logs.command.debug.shellInitNotFound(manifest.shellInit.path));
          }
        } catch (error) {
          logger.error(logs.fs.error.deleteFailed(manifest.shellInit.path, String(error)));
          logger.debug(logs.command.debug.shellInitDeletion(manifest.shellInit.path, false, false), String(error));
        }
      }

      // Delete symlinks
      if (manifest.symlinks && manifest.symlinks.length > 0) {
        logger.info(logs.general.success.cleanupSymlinkDeletion());
        for (const symlinkOp of manifest.symlinks) {
          try {
            if (await fs.lstat(symlinkOp.targetPath).catch(() => null)) {
              // Check if path exists (could be symlink or regular file if broken)
              if (!dryRun) {
                await fs.rm(symlinkOp.targetPath, { force: true });
                logger.info(logs.fs.success.removed('cleanup', contractHomePath(services.yamlConfig.paths.homeDir, symlinkOp.targetPath)));
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
    }

    // Delete the entire .generated directory
    try {
      logger.debug(logs.command.debug.fileDeletion(yamlConfig.paths.generatedDir, true, false));
      if (await fs.exists(yamlConfig.paths.generatedDir)) {
        if (!dryRun) {
          await fs.rm(yamlConfig.paths.generatedDir, { recursive: true, force: true });
          logger.info(
            logs.fs.success.removed('cleanup', contractHomePath(yamlConfig.paths.homeDir, yamlConfig.paths.generatedDir)),
          );
          logger.debug(logs.command.debug.fileDeletion(yamlConfig.paths.generatedDir, true, false));
        } else {
          logger.info(logs.general.success.directoryCleanupInfo(yamlConfig.paths.generatedDir, true, true));
          logger.debug(logs.command.debug.fileDeletion(yamlConfig.paths.generatedDir, true, true));
        }
      } else {
        logger.info(logs.general.success.directoryCleanupInfo(yamlConfig.paths.generatedDir, false, false));
        logger.debug(logs.command.debug.fileNotFound(yamlConfig.paths.generatedDir));
      }
    } catch (error) {
      logger.error(logs.fs.error.deleteFailed(yamlConfig.paths.generatedDir, String(error)));
      logger.debug(logs.command.debug.fileDeletion(yamlConfig.paths.generatedDir, false, false), String(error));
    }

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

      logger.debug(logs.command.debug.actionCalled('cleanup'), combinedOptions);
      const services = await servicesFactory();
      await cleanupActionLogic(logger, combinedOptions, services);
    });
}