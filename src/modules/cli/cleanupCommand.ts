import { exitCli } from '@modules/cli/exitCli';
import { type TsLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import { type GlobalProgram, type Services } from '../../cli';

export interface CleanupCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

async function cleanupActionLogic(
  parentLogger: TsLogger,
  options: CleanupCommandOptions,
  services: Services,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'cleanupActionLogic' });
  const { yamlConfig, fs } = services;
  const { dryRun } = options;

  try {
    logger.debug('execute: starting cleanup process, dryRun=%s', dryRun);
    logger.info(
      dryRun ? 'Starting dry run cleanup (no files will be removed)...' : 'Starting cleanup...',
    );

    let manifest: GeneratedArtifactsManifest | null = null;

    try {
      logger.debug(`execute: attempting to read manifest from ${yamlConfig.paths.manifestPath}`);
      if (await fs.exists(yamlConfig.paths.manifestPath)) {
        const manifestContent = await fs.readFile(yamlConfig.paths.manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
        logger.debug('execute: manifest file read and parsed successfully');
      } else {
        logger.debug('execute: manifest file does not exist');
        logger.warn(`Manifest file not found at ${yamlConfig.paths.manifestPath}.`);
      }
    } catch (error) {
      logger.debug(`execute: error reading or parsing manifest file: ${String(error)}`);
      logger.error(`Error reading manifest file: ${String(error)}`);
      logger.warn('Proceeding to delete generated directory despite manifest error.');
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
              logger.warn(`  Shim not found, skipping: ${shimPath}`);
              logger.debug(`execute: shim not found ${shimPath}`);
            }
          } catch (error) {
            logger.error(`  Error deleting shim ${shimPath}: ${String(error)}`);
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
            logger.warn(`  Shell init file not found, skipping: ${manifest.shellInit.path}`);
            logger.debug(`execute: shell init file not found ${manifest.shellInit.path}`);
          }
        } catch (error) {
          logger.error(
            `  Error deleting shell init ${manifest.shellInit.path}: ${String(error)}`,
          );
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
              logger.warn(`  Symlink target not found, skipping: ${symlinkOp.targetPath}`);
              logger.debug(`execute: symlink target not found ${symlinkOp.targetPath}`);
            }
          } catch (error) {
            logger.error(`  Error deleting symlink ${symlinkOp.targetPath}: ${String(error)}`);
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
      logger.error(
        `Error deleting generated directory ${yamlConfig.paths.generatedDir}: ${String(error)}`,
      );
      logger.debug(
        `execute: error deleting generated directory ${yamlConfig.paths.generatedDir}: ${String(
          error,
        )}`,
      );
    }

    logger.info(dryRun ? 'Dry run cleanup complete.' : 'Cleanup complete.');
    logger.debug('execute: cleanup process finished, dryRun=%s', dryRun);
  } catch (error) {
    logger.error('Critical error in cleanup command: %s', (error as Error).message);
    logger.debug('Error details: %O', error);
    exitCli(1);
  }
}

export function registerCleanupCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  services: Services,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCleanupCommand' });
  program
    .command('cleanup')
    .description(
      'Remove all generated artifacts, including shims, shell configurations, and the .generated directory.',
    )
    .action(async (options) => {
      const combinedOptions: CleanupCommandOptions = { ...options, ...program.opts() };

      logger.debug('cleanup command: Action called with options: %o', combinedOptions);
      await cleanupActionLogic(logger, combinedOptions, services);
    });
}