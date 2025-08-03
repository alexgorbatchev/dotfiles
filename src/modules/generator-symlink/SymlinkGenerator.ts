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
import { TrackedFileSystem } from '@modules/file-registry';
import { expandHomePath } from '@utils';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';

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
      // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
      const toolFs = this.fs instanceof TrackedFileSystem 
        ? this.fs.withToolName(toolName)
        : this.fs;

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

        if (!(await toolFs.exists(sourceAbsPath))) {
          currentStatus = 'skipped_source_missing';
          logger.warn(
            WarningTemplates.fs.notFound('Source file', sourceAbsPath)
          );
          results.push({
            sourcePath: sourceAbsPath,
            targetPath: targetAbsPath,
            status: currentStatus,
          });
          continue;
        }

        const targetExists = await toolFs.exists(targetAbsPath);
        const targetIsDir = targetExists
          ? (await toolFs.stat(targetAbsPath)).isDirectory()
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
              toolFs.constructor.name,
            );
            // Backup behavior determined by IFileSystem
            try {
              if (await toolFs.exists(backupPath)) {
                logger.warn(
                  WarningTemplates.fs.overwriting(backupPath)
                );
                await toolFs.rm(backupPath, { recursive: true, force: true });
              }
              await toolFs.rename(targetAbsPath, backupPath);
              currentStatus = 'backed_up';
              logger.debug(
                'Successfully backed up "%s" to "%s" using %s.',
                targetAbsPath,
                backupPath,
                toolFs.constructor.name,
              );
            } catch (e: any) {
              currentStatus = 'failed';
              const errorMsg = ErrorTemplates.fs.writeFailed(`backup of ${targetAbsPath}`, e.message);
              currentError = errorMsg;
              logger.error(errorMsg);
            }
          }

          if (currentStatus !== 'failed') {
            logger.debug(
              'Overwrite enabled. Attempting to delete "%s" using %s.',
              targetAbsPath,
              toolFs.constructor.name,
            );
            // Deletion behavior determined by IFileSystem
            try {
              if (targetIsDir) {
                await toolFs.rm(targetAbsPath, { recursive: true, force: true });
              } else {
                await toolFs.rm(targetAbsPath, { force: true });
              }
              logger.debug(
                'Successfully deleted "%s" for overwrite using %s.',
                targetAbsPath,
                toolFs.constructor.name,
              );
              // Status remains 'updated_target' or 'backed_up'
            } catch (e: any) {
              currentStatus = 'failed';
              const errorMsg = ErrorTemplates.fs.deleteFailed(targetAbsPath, e.message);
              currentError = errorMsg;
              logger.error(errorMsg);
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
          toolFs.constructor.name,
        );
        // ensureDir behavior determined by IFileSystem
        try {
          await toolFs.ensureDir(targetDir);
        } catch (e: any) {
          currentStatus = 'failed';
          const errorMsg = ErrorTemplates.fs.directoryCreateFailed(targetDir, e.message);
          currentError = errorMsg;
          logger.error(errorMsg);
        }

        if (currentStatus !== 'failed') {
          logger.debug(
            'Attempting to create symlink from "%s" to "%s" using %s.',
            sourceAbsPath,
            targetAbsPath,
            toolFs.constructor.name,
          );
          // Symlink creation behavior determined by IFileSystem
          try {
            await toolFs.symlink(sourceAbsPath, targetAbsPath);
            logger.debug(
              'Successfully created symlink from "%s" to "%s" using %s.',
              sourceAbsPath,
              targetAbsPath,
              toolFs.constructor.name,
            );
            // currentStatus is already 'created', 'updated_target', or 'backed_up'
          } catch (e: any) {
            currentStatus = 'failed';
            const errorMsg = ErrorTemplates.fs.symlinkFailed(sourceAbsPath, targetAbsPath, (e as Error).message);
            currentError = errorMsg;
            logger.error(errorMsg);
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
