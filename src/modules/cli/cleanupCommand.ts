import { exitCli } from '@modules/cli/exitCli';
import { createClientLogger, createLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import type { ConsolaInstance } from 'consola';
import { type GlobalProgram, type Services } from '../../cli';

const log = createLogger('cleanupCommand');

export interface CleanupCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

async function cleanupActionLogic(
  options: CleanupCommandOptions,
  services: Services,
  clientLogger: ConsolaInstance,
) {
  const { yamlConfig, fs } = services;
  const { dryRun } = options;

  try {
    log('execute: starting cleanup process, dryRun=%s', dryRun);
    clientLogger.info(
      dryRun ? 'Starting dry run cleanup (no files will be removed)...' : 'Starting cleanup...',
    );

    let manifest: GeneratedArtifactsManifest | null = null;

    try {
      log(`execute: attempting to read manifest from ${yamlConfig.paths.manifestPath}`);
      if (await fs.exists(yamlConfig.paths.manifestPath)) {
        const manifestContent = await fs.readFile(yamlConfig.paths.manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
        log('execute: manifest file read and parsed successfully');
      } else {
        log('execute: manifest file does not exist');
        clientLogger.warn(`Manifest file not found at ${yamlConfig.paths.manifestPath}.`);
      }
    } catch (error) {
      log(`execute: error reading or parsing manifest file: ${String(error)}`);
      clientLogger.error(`Error reading manifest file: ${String(error)}`);
      clientLogger.warn('Proceeding to delete generated directory despite manifest error.');
    }

    if (manifest) {
      // Delete shims
      if (manifest.shims && manifest.shims.length > 0) {
        clientLogger.info('Deleting shims...');
        for (const shimPath of manifest.shims) {
          try {
            if (await fs.exists(shimPath)) {
              if (!dryRun) {
                await fs.rm(shimPath, { force: true });
                clientLogger.info(`  Deleted shim: ${shimPath}`);
                log(`execute: deleted shim ${shimPath}`);
              } else {
                clientLogger.info(`  Would delete shim: ${shimPath}`);
                log(`execute: would delete shim ${shimPath} (dry run)`);
              }
            } else {
              clientLogger.warn(`  Shim not found, skipping: ${shimPath}`);
              log(`execute: shim not found ${shimPath}`);
            }
          } catch (error) {
            clientLogger.error(`  Error deleting shim ${shimPath}: ${String(error)}`);
            log(`execute: error deleting shim ${shimPath}: ${String(error)}`);
          }
        }
      }

      // Delete shell init file
      if (manifest.shellInit?.path) {
        clientLogger.info('Deleting shell init file...');
        try {
          if (await fs.exists(manifest.shellInit.path)) {
            if (!dryRun) {
              await fs.rm(manifest.shellInit.path, { force: true });
              clientLogger.info(`  Deleted shell init: ${manifest.shellInit.path}`);
              log(`execute: deleted shell init ${manifest.shellInit.path}`);
            } else {
              clientLogger.info(`  Would delete shell init: ${manifest.shellInit.path}`);
              log(`execute: would delete shell init ${manifest.shellInit.path} (dry run)`);
            }
          } else {
            clientLogger.warn(
              `  Shell init file not found, skipping: ${manifest.shellInit.path}`,
            );
            log(`execute: shell init file not found ${manifest.shellInit.path}`);
          }
        } catch (error) {
          clientLogger.error(
            `  Error deleting shell init ${manifest.shellInit.path}: ${String(error)}`,
          );
          log(
            `execute: error deleting shell init ${manifest.shellInit.path}: ${String(error)}`,
          );
        }
      }

      // Delete symlinks
      if (manifest.symlinks && manifest.symlinks.length > 0) {
        clientLogger.info('Deleting symlinks...');
        for (const symlinkOp of manifest.symlinks) {
          try {
            if (await fs.lstat(symlinkOp.targetPath).catch(() => null)) {
              // Check if path exists (could be symlink or regular file if broken)
              if (!dryRun) {
                await fs.rm(symlinkOp.targetPath, { force: true });
                clientLogger.info(`  Deleted symlink: ${symlinkOp.targetPath}`);
                log(`execute: deleted symlink ${symlinkOp.targetPath}`);
              } else {
                clientLogger.info(`  Would delete symlink: ${symlinkOp.targetPath}`);
                log(`execute: would delete symlink ${symlinkOp.targetPath} (dry run)`);
              }
            } else {
              clientLogger.warn(`  Symlink target not found, skipping: ${symlinkOp.targetPath}`);
              log(`execute: symlink target not found ${symlinkOp.targetPath}`);
            }
          } catch (error) {
            clientLogger.error(
              `  Error deleting symlink ${symlinkOp.targetPath}: ${String(error)}`,
            );
            log(
              `execute: error deleting symlink ${symlinkOp.targetPath}: ${String(error)}`,
            );
          }
        }
      }
    }

    // Delete the entire .generated directory
    try {
      log(`execute: attempting to delete generated directory: ${yamlConfig.paths.generatedDir}`);
      if (await fs.exists(yamlConfig.paths.generatedDir)) {
        if (!dryRun) {
          await fs.rm(yamlConfig.paths.generatedDir, { recursive: true, force: true });
          clientLogger.info(
            `Successfully deleted generated directory: ${yamlConfig.paths.generatedDir}`,
          );
          log(`execute: deleted generated directory ${yamlConfig.paths.generatedDir}`);
        } else {
          clientLogger.info(`Would delete generated directory: ${yamlConfig.paths.generatedDir}`);
          log(
            `execute: would delete generated directory ${yamlConfig.paths.generatedDir} (dry run)`,
          );
        }
      } else {
        clientLogger.info(`Generated directory not found, skipping: ${yamlConfig.paths.generatedDir}`);
        log(`execute: generated directory not found ${yamlConfig.paths.generatedDir}`);
      }
    } catch (error) {
      clientLogger.error(
        `Error deleting generated directory ${yamlConfig.paths.generatedDir}: ${String(error)}`,
      );
      log(
        `execute: error deleting generated directory ${yamlConfig.paths.generatedDir}: ${String(
          error,
        )}`,
      );
    }

    clientLogger.info(dryRun ? 'Dry run cleanup complete.' : 'Cleanup complete.');
    log('execute: cleanup process finished, dryRun=%s', dryRun);
  } catch (error) {
    log('cleanup command: Unhandled error in action handler: %O', error);
    clientLogger.error('Critical error in cleanup command: %s', (error as Error).message);
    clientLogger.debug('Error details: %O', error);
    exitCli(1);
  }
}

export function registerCleanupCommand(program: GlobalProgram, services: Services): void {
  program
    .command('cleanup')
    .description(
      'Remove all generated artifacts, including shims, shell configurations, and the .generated directory.',
    )
    .action(async (options) => {
      const combinedOptions: CleanupCommandOptions = { ...options, ...program.opts() };

      const clientLogger = createClientLogger({
        quiet: combinedOptions.quiet,
        verbose: combinedOptions.verbose,
      });

      log('cleanup command: Action called with options: %o', combinedOptions);
      await cleanupActionLogic(combinedOptions, services, clientLogger);
    });
}