import { exitCli } from '@modules/cli/exitCli';
import { type TsLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';

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
    logger.info('Registry-based cleanup: Removing all tracked files...');
    const allTools = await fileRegistry.getRegisteredTools();
    
    for (const toolName of allTools) {
      await cleanupToolFiles(logger, fs, fileRegistry, toolName, undefined, dryRun);
    }
    
    // Clean up the registry database itself
    if (!dryRun) {
      logger.info('Cleaning up registry database...');
      // We don't actually delete the registry DB, just compact it
      // await fileRegistry.compact();
    } else {
      logger.info('Would clean up registry database (dry run)');
    }
    
  } else if (tool) {
    // Remove files for specific tool
    logger.info(`Registry-based cleanup: Removing files for tool '${tool}'...`);
    await cleanupToolFiles(logger, fs, fileRegistry, tool, type, dryRun);
    
    if (!dryRun) {
      await fileRegistry.removeToolOperations(tool);
      logger.info(`Removed registry entries for tool: ${tool}`);
    } else {
      logger.info(`Would remove registry entries for tool: ${tool} (dry run)`);
    }
    
  } else if (type) {
    // Remove files of specific type across all tools
    logger.info(`Registry-based cleanup: Removing files of type '${type}'...`);
    const operations = await fileRegistry.getOperations({ fileType: type as any });
    
    for (const operation of operations) {
      const fileState = await fileRegistry.getFileState(operation.filePath);
      if (fileState && fileState.lastOperation !== 'delete') {
        await removeFile(logger, fs, operation.filePath, dryRun);
      }
    }
  } else {
    logger.warn('Registry-based cleanup requires --all, --tool <name>, or --type <type> option');
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
  
  logger.info(`Found ${filteredStates.length} files for tool '${toolName}'${fileType ? ` of type '${fileType}'` : ''}`);
  
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
        logger.info(`  Deleted: ${filePath}`);
      } else {
        logger.info(`  Would delete: ${filePath}`);
      }
    } else {
      logger.debug(`  File not found: ${filePath}`);
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
    logger.debug('execute: starting cleanup process, dryRun=%s, options=%o', dryRun, options);
    logger.info(
      dryRun ? 'Starting dry run cleanup (no files will be removed)...' : 'Starting cleanup...',
    );

    // If registry-based options are specified, use registry cleanup
    if (registry || tool || type || all) {
      await registryBasedCleanup(logger, services, options);
      return;
    }

    // Otherwise, fall back to legacy manifest-based cleanup

    let manifest: GeneratedArtifactsManifest | null = null;

    try {
      logger.debug(`execute: attempting to read manifest from ${yamlConfig.paths.manifestPath}`);
      if (await fs.exists(yamlConfig.paths.manifestPath)) {
        const manifestContent = await fs.readFile(yamlConfig.paths.manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
        logger.debug('execute: manifest file read and parsed successfully');
      } else {
        logger.debug('execute: manifest file does not exist');
        logger.warn(WarningTemplates.fs.notFound('Manifest file', yamlConfig.paths.manifestPath));
      }
    } catch (error) {
      logger.debug(`execute: error reading or parsing manifest file: ${String(error)}`);
      logger.error(ErrorTemplates.fs.readFailed('manifest file', String(error)));
      logger.warn(WarningTemplates.config.ignored('manifest file', 'proceeding to delete generated directory despite manifest error'));
    }

    if (manifest) {
      // Delete shims
      if (manifest.shims && manifest.shims.length > 0) {
        logger.info('Deleting shims...');
        for (const shimPath of manifest.shims) {
          try {
            if (await fs.exists(shimPath)) {
              if (!dryRun) {
                await fs.rm(shimPath, { force: true });
                logger.info(`  Deleted shim: ${shimPath}`);
                logger.debug(`execute: deleted shim ${shimPath}`);
              } else {
                logger.info(`  Would delete shim: ${shimPath}`);
                logger.debug(`execute: would delete shim ${shimPath} (dry run)`);
              }
            } else {
              logger.warn(WarningTemplates.fs.notFound('Shim', shimPath));
              logger.debug(`execute: shim not found ${shimPath}`);
            }
          } catch (error) {
            logger.error(ErrorTemplates.fs.deleteFailed(shimPath, String(error)));
            logger.debug(`execute: error deleting shim ${shimPath}: ${String(error)}`);
          }
        }
      }

      // Delete shell init file
      if (manifest.shellInit?.path) {
        logger.info('Deleting shell init file...');
        try {
          if (await fs.exists(manifest.shellInit.path)) {
            if (!dryRun) {
              await fs.rm(manifest.shellInit.path, { force: true });
              logger.info(`  Deleted shell init: ${manifest.shellInit.path}`);
              logger.debug(`execute: deleted shell init ${manifest.shellInit.path}`);
            } else {
              logger.info(`  Would delete shell init: ${manifest.shellInit.path}`);
              logger.debug(`execute: would delete shell init ${manifest.shellInit.path} (dry run)`);
            }
          } else {
            logger.warn(WarningTemplates.fs.notFound('Shell init file', manifest.shellInit.path));
            logger.debug(`execute: shell init file not found ${manifest.shellInit.path}`);
          }
        } catch (error) {
          logger.error(ErrorTemplates.fs.deleteFailed(manifest.shellInit.path, String(error)));
          logger.debug(
            `execute: error deleting shell init ${manifest.shellInit.path}: ${String(error)}`,
          );
        }
      }

      // Delete symlinks
      if (manifest.symlinks && manifest.symlinks.length > 0) {
        logger.info('Deleting symlinks...');
        for (const symlinkOp of manifest.symlinks) {
          try {
            if (await fs.lstat(symlinkOp.targetPath).catch(() => null)) {
              // Check if path exists (could be symlink or regular file if broken)
              if (!dryRun) {
                await fs.rm(symlinkOp.targetPath, { force: true });
                logger.info(`  Deleted symlink: ${symlinkOp.targetPath}`);
                logger.debug(`execute: deleted symlink ${symlinkOp.targetPath}`);
              } else {
                logger.info(`  Would delete symlink: ${symlinkOp.targetPath}`);
                logger.debug(`execute: would delete symlink ${symlinkOp.targetPath} (dry run)`);
              }
            } else {
              logger.warn(WarningTemplates.fs.notFound('Symlink target', symlinkOp.targetPath));
              logger.debug(`execute: symlink target not found ${symlinkOp.targetPath}`);
            }
          } catch (error) {
            logger.error(ErrorTemplates.fs.deleteFailed(symlinkOp.targetPath, String(error)));
            logger.debug(
              `execute: error deleting symlink ${symlinkOp.targetPath}: ${String(error)}`,
            );
          }
        }
      }
    }

    // Delete the entire .generated directory
    try {
      logger.debug(
        `execute: attempting to delete generated directory: ${yamlConfig.paths.generatedDir}`,
      );
      if (await fs.exists(yamlConfig.paths.generatedDir)) {
        if (!dryRun) {
          await fs.rm(yamlConfig.paths.generatedDir, { recursive: true, force: true });
          logger.info(
            `Successfully deleted generated directory: ${yamlConfig.paths.generatedDir}`,
          );
          logger.debug(`execute: deleted generated directory ${yamlConfig.paths.generatedDir}`);
        } else {
          logger.info(`Would delete generated directory: ${yamlConfig.paths.generatedDir}`);
          logger.debug(
            `execute: would delete generated directory ${yamlConfig.paths.generatedDir} (dry run)`,
          );
        }
      } else {
        logger.info(`Generated directory not found, skipping: ${yamlConfig.paths.generatedDir}`);
        logger.debug(`execute: generated directory not found ${yamlConfig.paths.generatedDir}`);
      }
    } catch (error) {
      logger.error(ErrorTemplates.fs.deleteFailed(yamlConfig.paths.generatedDir, String(error)));
      logger.debug(
        `execute: error deleting generated directory ${yamlConfig.paths.generatedDir}: ${String(
          error,
        )}`,
      );
    }

    logger.info(dryRun ? 'Dry run cleanup complete.' : 'Cleanup complete.');
    logger.debug('execute: cleanup process finished, dryRun=%s', dryRun);
  } catch (error) {
    logger.error(ErrorTemplates.command.executionFailed('cleanup', 1, (error as Error).message));
    logger.debug('Error details: %O', error);
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

      logger.debug('cleanup command: Action called with options: %o', combinedOptions);
      const services = await servicesFactory();
      await cleanupActionLogic(logger, combinedOptions, services);
    });
}