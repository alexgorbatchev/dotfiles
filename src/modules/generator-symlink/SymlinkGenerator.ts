/**
 * @file src/modules/generator-symlink/SymlinkGenerator.ts
 * @description Implementation of the symlink generator service.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define `GenerateSymlinksOptions` interface (in `ISymlinkGenerator.ts`).
 * - [x] Define `ISymlinkGenerator` interface (in `ISymlinkGenerator.ts`).
 * - [x] Implement `SymlinkGenerator` class.
 *   - [x] Constructor accepts `IFileSystem` and `AppConfig`.
 *   - [x] Implement `generate` method:
 *     - [x] Update return type to `Promise<SymlinkOperationResult[]>`.
 *     - [x] Collect and return `SymlinkOperationResult` for each operation.
 *     - [x] Get home directory and project root from `AppConfig`.
 *     - [x] Fix homeDir resolution to use `appConfig.homeDir`.
 *     - [x] Iterate through `toolConfigs` and their `symlinks`.
 *     - [x] Resolve absolute source and target paths.
 *     - [x] Handle `~` expansion in target paths.
 *     - [x] Check source existence.
 *     - [x] Handle target existence (skip, overwrite, backup).
 *     - [x] Ensure target directory exists (behavior determined by injected `IFileSystem` type).
 *     - [x] Create symlink (behavior determined by injected `IFileSystem` type).
 * - [x] Write tests for `SymlinkGenerator` (in `__tests__/SymlinkGenerator.test.ts`).
 * - [x] Create `index.ts` to export the interface and class.
 * - [x] Refactor dry run mechanism:
 *   - [x] Remove internal `dryRun` logic.
 *   - [x] Rely on injected `IFileSystem` for dry/real run behavior.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import path from 'node:path';
import type { AppConfig, ToolConfig } from '@types';
import type { IFileSystem } from '@modules/file-system';
import { createLogger } from '@modules/logger';
import type {
  GenerateSymlinksOptions,
  ISymlinkGenerator,
  SymlinkOperationResult,
} from './ISymlinkGenerator';

const log = createLogger('SymlinkGenerator');

export class SymlinkGenerator implements ISymlinkGenerator {
  private readonly fs: IFileSystem;
  private readonly appConfig: AppConfig;

  constructor(fileSystem: IFileSystem, appConfig: AppConfig) {
    this.fs = fileSystem;
    this.appConfig = appConfig;
    log('constructor: SymlinkGenerator initialized');
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options: GenerateSymlinksOptions = {}
  ): Promise<SymlinkOperationResult[]> {
    log(
      'generate: Starting symlink generation. Options: %o, FileSystem: %s',
      options,
      this.fs.constructor.name
    );
    const results: SymlinkOperationResult[] = [];
    // dryRun is removed; IFileSystem handles behavior
    const { overwrite = false, backup = false } = options;
    const homeDir = this.appConfig.homeDir;
    const projectRoot = this.appConfig.dotfilesDir;

    log('generate: Home directory determined as: %s', homeDir);
    log('generate: Project root determined as: %s', projectRoot);

    for (const toolName in toolConfigs) {
      const toolConfig = toolConfigs[toolName];
      if (!toolConfig) {
        log('generate: Tool config for "%s" is undefined. Skipping.', toolName);
        continue;
      }
      if (!toolConfig.symlinks || toolConfig.symlinks.length === 0) {
        log('generate: Tool "%s" has no symlinks defined, skipping.', toolName);
        continue;
      }

      log('generate: Processing symlinks for tool "%s"', toolName);
      for (const symlinkConfig of toolConfig.symlinks) {
        const sourceRelPath = symlinkConfig.source;
        const targetRelPath = symlinkConfig.target;

        const sourceAbsPath = path.resolve(projectRoot, sourceRelPath);
        let targetAbsPath = targetRelPath.startsWith('~')
          ? path.join(homeDir, targetRelPath.substring(1))
          : path.join(homeDir, targetRelPath);

        if (!path.isAbsolute(targetAbsPath)) {
          targetAbsPath = path.resolve(homeDir, targetRelPath);
        }

        log(
          'generate: Processing symlink: source="%s" (abs: "%s"), target="%s" (abs: "%s")',
          sourceRelPath,
          sourceAbsPath,
          targetRelPath,
          targetAbsPath
        );

        let currentStatus: SymlinkOperationResult['status'] = 'created'; // Optimistic default
        let currentError: string | undefined;

        if (!(await this.fs.exists(sourceAbsPath))) {
          currentStatus = 'skipped_source_missing';
          log(
            'generate: WARN: Source file "%s" for tool "%s" does not exist. Skipping symlink.',
            sourceAbsPath,
            toolName
          );
          results.push({
            sourcePath: sourceAbsPath,
            targetPath: targetAbsPath,
            status: currentStatus,
          });
          continue;
        }

        const targetExists = await this.fs.exists(targetAbsPath);
        const targetIsDir = targetExists
          ? (await this.fs.stat(targetAbsPath)).isDirectory()
          : false;

        if (targetExists) {
          log('generate: Target path "%s" already exists.', targetAbsPath);
          if (!overwrite) {
            currentStatus = 'skipped_exists';
            log(
              'generate: Target "%s" exists and overwrite is false. Skipping symlink creation.',
              targetAbsPath
            );
            results.push({
              sourcePath: sourceAbsPath,
              targetPath: targetAbsPath,
              status: currentStatus,
            });
            continue;
          }

          // Overwrite is true
          currentStatus = 'updated_target'; // Tentative status
          if (backup) {
            const backupPath = `${targetAbsPath}.bak`;
            log(
              'generate: Backup option enabled. Attempting to rename "%s" to "%s" using %s.',
              targetAbsPath,
              backupPath,
              this.fs.constructor.name
            );
            // Backup behavior determined by IFileSystem
            try {
              if (await this.fs.exists(backupPath)) {
                log(
                  'generate: WARN: Backup path "%s" already exists. Deleting it before new backup using %s.',
                  backupPath,
                  this.fs.constructor.name
                );
                await this.fs.rm(backupPath, { recursive: true, force: true });
              }
              await this.fs.rename(targetAbsPath, backupPath);
              currentStatus = 'backed_up';
              log(
                'generate: Successfully backed up "%s" to "%s" using %s.',
                targetAbsPath,
                backupPath,
                this.fs.constructor.name
              );
            } catch (e: any) {
              currentStatus = 'failed';
              currentError = `Backup failed for "${targetAbsPath}": ${e.message}`;
              log('generate: ERROR: %s', currentError);
            }
          }

          if (currentStatus !== 'failed') {
            log(
              'generate: Overwrite enabled. Attempting to delete "%s" using %s.',
              targetAbsPath,
              this.fs.constructor.name
            );
            // Deletion behavior determined by IFileSystem
            try {
              if (targetIsDir) {
                await this.fs.rm(targetAbsPath, { recursive: true, force: true });
              } else {
                await this.fs.rm(targetAbsPath, { force: true });
              }
              log(
                'generate: Successfully deleted "%s" for overwrite using %s.',
                targetAbsPath,
                this.fs.constructor.name
              );
              // Status remains 'updated_target' or 'backed_up'
            } catch (e: any) {
              currentStatus = 'failed';
              currentError = `Delete for overwrite failed for "${targetAbsPath}": ${e.message}`;
              log('generate: ERROR: %s', currentError);
            }
          }
        } // End if (targetExists && overwrite)

        if (currentStatus === 'failed') {
          results.push({
            sourcePath: sourceAbsPath,
            targetPath: targetAbsPath,
            status: currentStatus,
            error: currentError,
          });
          continue;
        }

        const targetDir = path.dirname(targetAbsPath);
        log(
          'generate: Ensuring target directory "%s" exists using %s.',
          targetDir,
          this.fs.constructor.name
        );
        // ensureDir behavior determined by IFileSystem
        try {
          await this.fs.ensureDir(targetDir);
        } catch (e: any) {
          currentStatus = 'failed';
          currentError = `Ensure dir failed for "${targetDir}": ${e.message}`;
          log('generate: ERROR: %s', currentError);
        }

        if (currentStatus !== 'failed') {
          log(
            'generate: Attempting to create symlink from "%s" to "%s" using %s.',
            sourceAbsPath,
            targetAbsPath,
            this.fs.constructor.name
          );
          // Symlink creation behavior determined by IFileSystem
          try {
            await this.fs.symlink(sourceAbsPath, targetAbsPath);
            log(
              'generate: Successfully created symlink from "%s" to "%s" using %s.',
              sourceAbsPath,
              targetAbsPath,
              this.fs.constructor.name
            );
            // currentStatus is already 'created', 'updated_target', or 'backed_up'
          } catch (e: any) {
            currentStatus = 'failed';
            currentError = `Symlink creation failed for "${targetAbsPath}" from "${sourceAbsPath}": ${e.message}`;
            log('generate: ERROR: %s', currentError);
          }
        }
        results.push({
          sourcePath: sourceAbsPath,
          targetPath: targetAbsPath,
          status: currentStatus,
          error: currentError,
        });
      } // End for symlinkConfig
    } // End for toolName
    log('generate: Symlink generation process completed. Results: %o', results);
    return results;
  }
}
