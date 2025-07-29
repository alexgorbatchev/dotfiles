import path from 'node:path';
import type { ToolConfig } from '@types';
import type { IFileSystem } from '@modules/file-system';
import type { YamlConfig } from '@modules/config';
import type { TsLogger } from '@modules/logger';
import type {
  GenerateSymlinksOptions,
  ISymlinkGenerator,
  SymlinkOperationResult,
} from './ISymlinkGenerator';
import { expandHomePath } from '@utils';

export class SymlinkGenerator implements ISymlinkGenerator {
  private readonly fs: IFileSystem;
  private readonly yamlConfig: YamlConfig;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, yamlConfig: YamlConfig) {
    this.fs = fileSystem;
    this.yamlConfig = yamlConfig;
    this.logger = parentLogger.getSubLogger({ name: 'SymlinkGenerator' });
    this.logger.debug('constructor: SymlinkGenerator initialized');
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options: GenerateSymlinksOptions = {},
  ): Promise<SymlinkOperationResult[]> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    logger.debug(
      'Starting symlink generation. Options: %o, FileSystem: %s',
      options,
      this.fs.constructor.name,
    );
    const results: SymlinkOperationResult[] = [];
    const { overwrite = false, backup = false } = options;
    const homeDir = this.yamlConfig.paths.homeDir;
    const dotfilesDir = this.yamlConfig.paths.dotfilesDir;

    for (const toolName in toolConfigs) {
      const toolConfig = toolConfigs[toolName];
      if (!toolConfig) {
        logger.debug('Tool config for "%s" is undefined. Skipping.', toolName);
        continue;
      }
      if (!toolConfig.symlinks || toolConfig.symlinks.length === 0) {
        logger.debug('Tool "%s" has no symlinks defined, skipping.', toolName);
        continue;
      }

      logger.debug('Processing symlinks for tool "%s"', toolName);
      for (const symlinkConfig of toolConfig.symlinks) {
        const sourceRelPath = symlinkConfig.source;
        const targetRelPath = symlinkConfig.target;
        const sourceAbsPath = path.resolve(dotfilesDir, sourceRelPath);
        let targetAbsPath = expandHomePath(homeDir, targetRelPath);

        if (!path.isAbsolute(targetAbsPath)) {
          targetAbsPath = path.resolve(this.yamlConfig.paths.targetDir, targetRelPath);
        }

        logger.debug(
          'Processing symlink: source="%s" (abs: "%s"), target="%s" (abs: "%s")',
          sourceRelPath,
          sourceAbsPath,
          targetRelPath,
          targetAbsPath,
        );

        let currentStatus: SymlinkOperationResult['status'] = 'created'; // Optimistic default
        let currentError: string | undefined;

        if (!(await this.fs.exists(sourceAbsPath))) {
          currentStatus = 'skipped_source_missing';
          logger.warn(
            'Source file "%s" for tool "%s" does not exist. Skipping symlink.',
            sourceAbsPath,
            toolName,
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
          logger.debug('Target path "%s" already exists.', targetAbsPath);
          if (!overwrite) {
            currentStatus = 'skipped_exists';
            logger.debug(
              'Target "%s" exists and overwrite is false. Skipping symlink creation.',
              targetAbsPath,
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
            logger.debug(
              'Backup option enabled. Attempting to rename "%s" to "%s" using %s.',
              targetAbsPath,
              backupPath,
              this.fs.constructor.name,
            );
            // Backup behavior determined by IFileSystem
            try {
              if (await this.fs.exists(backupPath)) {
                logger.warn(
                  'Backup path "%s" already exists. Deleting it before new backup using %s.',
                  backupPath,
                  this.fs.constructor.name,
                );
                await this.fs.rm(backupPath, { recursive: true, force: true });
              }
              await this.fs.rename(targetAbsPath, backupPath);
              currentStatus = 'backed_up';
              logger.debug(
                'Successfully backed up "%s" to "%s" using %s.',
                targetAbsPath,
                backupPath,
                this.fs.constructor.name,
              );
            } catch (e: any) {
              currentStatus = 'failed';
              currentError = `Backup failed for "${targetAbsPath}": ${e.message}`;
              logger.error(currentError);
            }
          }

          if (currentStatus !== 'failed') {
            logger.debug(
              'Overwrite enabled. Attempting to delete "%s" using %s.',
              targetAbsPath,
              this.fs.constructor.name,
            );
            // Deletion behavior determined by IFileSystem
            try {
              if (targetIsDir) {
                await this.fs.rm(targetAbsPath, { recursive: true, force: true });
              } else {
                await this.fs.rm(targetAbsPath, { force: true });
              }
              logger.debug(
                'Successfully deleted "%s" for overwrite using %s.',
                targetAbsPath,
                this.fs.constructor.name,
              );
              // Status remains 'updated_target' or 'backed_up'
            } catch (e: any) {
              currentStatus = 'failed';
              currentError = `Delete for overwrite failed for "${targetAbsPath}": ${e.message}`;
              logger.error(currentError);
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
        logger.debug(
          'Ensuring target directory "%s" exists using %s.',
          targetDir,
          this.fs.constructor.name,
        );
        // ensureDir behavior determined by IFileSystem
        try {
          await this.fs.ensureDir(targetDir);
        } catch (e: any) {
          currentStatus = 'failed';
          currentError = `Ensure dir failed for "${targetDir}": ${e.message}`;
          logger.error(currentError);
        }

        if (currentStatus !== 'failed') {
          logger.debug(
            'Attempting to create symlink from "%s" to "%s" using %s.',
            sourceAbsPath,
            targetAbsPath,
            this.fs.constructor.name,
          );
          // Symlink creation behavior determined by IFileSystem
          try {
            await this.fs.symlink(sourceAbsPath, targetAbsPath);
            logger.debug(
              'Successfully created symlink from "%s" to "%s" using %s.',
              sourceAbsPath,
              targetAbsPath,
              this.fs.constructor.name,
            );
            // currentStatus is already 'created', 'updated_target', or 'backed_up'
          } catch (e: any) {
            currentStatus = 'failed';
            currentError = `Symlink creation failed for "${targetAbsPath}" from "${sourceAbsPath}": ${
              (e as Error).message
            }`;
            logger.error(currentError);
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
    logger.debug('Symlink generation process completed. Results: %o', results);
    return results;
  }
}
