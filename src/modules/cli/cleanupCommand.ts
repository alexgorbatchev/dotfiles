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
 * - [x] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code.
 * - [x] Update the memory bank with the new information when all tasks are complete.
 */

import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import { createLogger } from '@modules/logger';
import { createClientLogger } from '@modules/logger/clientLogger';
import type { GeneratedArtifactsManifest } from '@types';
import type { Command } from 'commander';

const log = createLogger('cleanupCommand');

export class CleanupCommand {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly fs: IFileSystem,
    private readonly logger: ReturnType<typeof createClientLogger>,
  ) {
    log('CleanupCommand initialized');
  }

  async execute(): Promise<void> {
    log('execute: starting cleanup process');
    this.logger.info('Starting cleanup...');

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
              await this.fs.rm(shimPath, { force: true });
              this.logger.info(`  Deleted shim: ${shimPath}`);
              log(`execute: deleted shim ${shimPath}`);
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
            await this.fs.rm(manifest.shellInit.path, { force: true });
            this.logger.info(`  Deleted shell init: ${manifest.shellInit.path}`);
            log(`execute: deleted shell init ${manifest.shellInit.path}`);
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
              await this.fs.rm(symlinkOp.targetPath, { force: true });
              this.logger.info(`  Deleted symlink: ${symlinkOp.targetPath}`);
              log(`execute: deleted symlink ${symlinkOp.targetPath}`);
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
        await this.fs.rm(this.appConfig.generatedDir, { recursive: true, force: true });
        this.logger.info(`Successfully deleted generated directory: ${this.appConfig.generatedDir}`);
        log(`execute: deleted generated directory ${this.appConfig.generatedDir}`);
      } else {
        this.logger.info(`Generated directory not found, skipping: ${this.appConfig.generatedDir}`);
        log(`execute: generated directory not found ${this.appConfig.generatedDir}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting generated directory ${this.appConfig.generatedDir}: ${String(error)}`);
      log(`execute: error deleting generated directory ${this.appConfig.generatedDir}: ${String(error)}`);
    }

    this.logger.info('Cleanup complete.');
    log('execute: cleanup process finished');
  }
}

export function registerCleanupCommand(
  program: Command,
  appConfig: AppConfig,
  fs: IFileSystem,
  logger: ReturnType<typeof createClientLogger>,
): void {
  program
    .command('cleanup')
    .description('Remove all generated artifacts, including shims, shell configurations, and the .generated directory.')
    .action(async () => {
      const cleanupCommand = new CleanupCommand(appConfig, fs, logger);
      try {
        await cleanupCommand.execute();
      } catch (error) {
        logger.error(`Cleanup command failed: ${String(error)}`);
        log(`registerCleanupCommand: error during cleanup execution: ${String(error)}`);
        process.exitCode = 1;
      }
    });
}