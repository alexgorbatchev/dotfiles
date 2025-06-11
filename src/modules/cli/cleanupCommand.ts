/**
 * @file cleanupCommand.ts
 * @description Implements the 'cleanup' CLI command.
 *
 * ## Development Plan
 *
 * - [x] Define `CleanupCommand` class.
 * - [x] Implement constructor to accept `AppConfig`, `IFileSystem`, and `ClientLogger`.
 * - [x] Implement `execute()` method:
 *   - [x] Add internal logging with `createLogger`.
 *   - [x] Attempt to read and parse `appConfig.manifestPath`.
 *   - [x] If manifest is successfully read:
 *     - [x] Delete shims listed in `manifest.shims`.
 *     - [x] Delete shell init file from `manifest.shellInit.path`.
 *     - [x] Delete symlinks from `manifest.symlinks` (using `targetAbsPath`).
 *     - [x] Use `clientLogger` for user feedback on deletions.
 *   - [x] If manifest read fails, log a warning via `clientLogger`.
 *   - [x] Delete the entire `appConfig.generatedDir` recursively.
 *   - [x] Log completion via `clientLogger`.
 * - [x] Write tests for `CleanupCommand` in `cleanupCommand.test.ts`.
 * - [x] Register `cleanup` command in `cli.ts`.
 * - [x] Add `--dry-run` option to show what would be removed without actually removing anything.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code.
 * - [x] Refactor to use `setupServices` in the action handler rather than receiving dependencies directly.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import { createLogger, createClientLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import type { Command } from 'commander';
import type { ConsolaInstance } from 'consola';
import { exitCli } from '@exitCli';
import { setupServices } from '../../cli';

const log = createLogger('cleanupCommand');

export interface CleanupCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  clientLogger: ConsolaInstance;
}

export interface CleanupCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

export class CleanupCommand {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly fs: IFileSystem,
    private readonly logger: ReturnType<typeof createClientLogger>,
    private readonly dryRun: boolean = false,
  ) {
    log('CleanupCommand initialized, dryRun=%s', dryRun);
  }

  async execute(): Promise<void> {
    log('execute: starting cleanup process, dryRun=%s', this.dryRun);
    this.logger.info(this.dryRun ? 'Starting dry run cleanup (no files will be removed)...' : 'Starting cleanup...');

    let manifest: GeneratedArtifactsManifest | null = null;

    try {
      log(`execute: attempting to read manifest from ${this.appConfig.manifestPath}`);
      if (await this.fs.exists(this.appConfig.manifestPath)) {
        const manifestContent = await this.fs.readFile(this.appConfig.manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent) as GeneratedArtifactsManifest;
        log('execute: manifest file read and parsed successfully');
      } else {
        log('execute: manifest file does not exist');
        this.logger.warn(`Manifest file not found at ${this.appConfig.manifestPath}.`);
      }
    } catch (error) {
      log(`execute: error reading or parsing manifest file: ${String(error)}`);
      this.logger.error(`Error reading manifest file: ${String(error)}`);
      this.logger.warn('Proceeding to delete generated directory despite manifest error.');
    }

    if (manifest) {
      // Delete shims
      if (manifest.shims && manifest.shims.length > 0) {
        this.logger.info('Deleting shims...');
        for (const shimPath of manifest.shims) {
          try {
            if (await this.fs.exists(shimPath)) {
              if (!this.dryRun) {
                await this.fs.rm(shimPath, { force: true });
                this.logger.info(`  Deleted shim: ${shimPath}`);
                log(`execute: deleted shim ${shimPath}`);
              } else {
                this.logger.info(`  Would delete shim: ${shimPath}`);
                log(`execute: would delete shim ${shimPath} (dry run)`);
              }
            } else {
              this.logger.warn(`  Shim not found, skipping: ${shimPath}`);
              log(`execute: shim not found ${shimPath}`);
            }
          } catch (error) {
            this.logger.error(`  Error deleting shim ${shimPath}: ${String(error)}`);
            log(`execute: error deleting shim ${shimPath}: ${String(error)}`);
          }
        }
      }

      // Delete shell init file
      if (manifest.shellInit?.path) {
        this.logger.info('Deleting shell init file...');
        try {
          if (await this.fs.exists(manifest.shellInit.path)) {
            if (!this.dryRun) {
              await this.fs.rm(manifest.shellInit.path, { force: true });
              this.logger.info(`  Deleted shell init: ${manifest.shellInit.path}`);
              log(`execute: deleted shell init ${manifest.shellInit.path}`);
            } else {
              this.logger.info(`  Would delete shell init: ${manifest.shellInit.path}`);
              log(`execute: would delete shell init ${manifest.shellInit.path} (dry run)`);
            }
          } else {
            this.logger.warn(`  Shell init file not found, skipping: ${manifest.shellInit.path}`);
            log(`execute: shell init file not found ${manifest.shellInit.path}`);
          }
        } catch (error) {
          this.logger.error(`  Error deleting shell init ${manifest.shellInit.path}: ${String(error)}`);
          log(`execute: error deleting shell init ${manifest.shellInit.path}: ${String(error)}`);
        }
      }

      // Delete symlinks
      if (manifest.symlinks && manifest.symlinks.length > 0) {
        this.logger.info('Deleting symlinks...');
        for (const symlinkOp of manifest.symlinks) {
          try {
            if (await this.fs.lstat(symlinkOp.targetPath).catch(() => null)) { // Check if path exists (could be symlink or regular file if broken)
              if (!this.dryRun) {
                await this.fs.rm(symlinkOp.targetPath, { force: true });
                this.logger.info(`  Deleted symlink: ${symlinkOp.targetPath}`);
                log(`execute: deleted symlink ${symlinkOp.targetPath}`);
              } else {
                this.logger.info(`  Would delete symlink: ${symlinkOp.targetPath}`);
                log(`execute: would delete symlink ${symlinkOp.targetPath} (dry run)`);
              }
            } else {
              this.logger.warn(`  Symlink target not found, skipping: ${symlinkOp.targetPath}`);
              log(`execute: symlink target not found ${symlinkOp.targetPath}`);
            }
          } catch (error) {
            this.logger.error(`  Error deleting symlink ${symlinkOp.targetPath}: ${String(error)}`);
            log(`execute: error deleting symlink ${symlinkOp.targetPath}: ${String(error)}`);
          }
        }
      }
    }

    // Delete the entire .generated directory
    try {
      log(`execute: attempting to delete generated directory: ${this.appConfig.generatedDir}`);
      if (await this.fs.exists(this.appConfig.generatedDir)) {
        if (!this.dryRun) {
          await this.fs.rm(this.appConfig.generatedDir, { recursive: true, force: true });
          this.logger.info(`Successfully deleted generated directory: ${this.appConfig.generatedDir}`);
          log(`execute: deleted generated directory ${this.appConfig.generatedDir}`);
        } else {
          this.logger.info(`Would delete generated directory: ${this.appConfig.generatedDir}`);
          log(`execute: would delete generated directory ${this.appConfig.generatedDir} (dry run)`);
        }
      } else {
        this.logger.info(`Generated directory not found, skipping: ${this.appConfig.generatedDir}`);
        log(`execute: generated directory not found ${this.appConfig.generatedDir}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting generated directory ${this.appConfig.generatedDir}: ${String(error)}`);
      log(`execute: error deleting generated directory ${this.appConfig.generatedDir}: ${String(error)}`);
    }

    this.logger.info(this.dryRun ? 'Dry run cleanup complete.' : 'Cleanup complete.');
    log('execute: cleanup process finished, dryRun=%s', this.dryRun);
  }
}

export async function cleanupActionLogic(
  options: CleanupCommandOptions,
  services: CleanupCommandServices
): Promise<void> {
  const { appConfig, fileSystem, clientLogger } = services;
  
  log('cleanupActionLogic: Called with options: %o', options);
  clientLogger.debug('Cleanup command logic started with options: %o', options);
  
  const cleanupCommand = new CleanupCommand(appConfig, fileSystem, clientLogger, options.dryRun);
  await cleanupCommand.execute();
}

export function registerCleanupCommand(
  program: Command,
): void {
  program
    .command('cleanup')
    .description('Remove all generated artifacts, including shims, shell configurations, and the .generated directory.')
    .option('--dry-run', 'Show what would be removed without actually removing anything', false)
    .option('--verbose', 'Show verbose output', false)
    .option('--quiet', 'Suppress all output', false)
    .action(async (options: CleanupCommandOptions) => {
      const clientLogger = createClientLogger({
        quiet: options.quiet,
        verbose: options.verbose,
      });
      log('cleanup command: Action called with options: %o', options);
      try {
        // Action handler calls setupServices to get its own instance of services
        const services = await setupServices({ dryRun: options.dryRun });

        const servicesForLogic: CleanupCommandServices = {
          appConfig: services.appConfig,
          fileSystem: services.fs,
          clientLogger,
        };
        await cleanupActionLogic(options, servicesForLogic);
      } catch (error) {
        log('cleanup command: Unhandled error in action handler: %O', error);
        clientLogger.error('Critical error in cleanup command: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}