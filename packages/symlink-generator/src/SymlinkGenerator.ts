import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { SystemInfo, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import { expandToolConfigPath } from '@dotfiles/utils';
import type { GenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from './ISymlinkGenerator';
import { messages } from './log-messages';

/**
 * Service that generates symbolic links for dotfiles.
 *
 * This class handles creating symlinks from source files (in the dotfiles repository)
 * to target locations (typically in the user's home directory). It supports overwriting
 * existing files, creating backups, and tracking which symlinks belong to which tools.
 * The generator expands paths using configuration variables and system information.
 */
export class SymlinkGenerator implements ISymlinkGenerator {
  private readonly fs: IFileSystem;
  private readonly yamlConfig: YamlConfig;
  private readonly systemInfo: SystemInfo;
  private readonly logger: TsLogger;

  /**
   * Creates a new SymlinkGenerator instance.
   *
   * @param parentLogger - The parent logger for creating sub-loggers.
   * @param fileSystem - The file system interface for file operations.
   * @param yamlConfig - The YAML configuration containing paths and settings.
   * @param systemInfo - System information for path expansion.
   */
  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, yamlConfig: YamlConfig, systemInfo: SystemInfo) {
    this.fs = fileSystem;
    this.yamlConfig = yamlConfig;
    this.systemInfo = systemInfo;
    this.logger = parentLogger.getSubLogger({ name: 'SymlinkGenerator' });
  }

  /**
   * @inheritdoc ISymlinkGenerator.generate
   */
  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options: GenerateSymlinksOptions = {}
  ): Promise<SymlinkOperationResult[]> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    logger.debug(messages.generate.started());
    const results: SymlinkOperationResult[] = [];

    for (const toolName in toolConfigs) {
      const toolConfig = toolConfigs[toolName];
      if (!this.shouldProcessTool(toolConfig, toolName, logger)) {
        continue;
      }

      const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;
      logger.debug(messages.generate.processingTool(toolName));

      for (const symlinkConfig of toolConfig.symlinks) {
        const result = await this.processSymlink(toolConfig, symlinkConfig, toolFs, options, logger);
        results.push(result);
      }
    }

    logger.debug(messages.generate.completed());
    return results;
  }

  /**
   * Determines whether a tool should be processed for symlink generation.
   *
   * @param toolConfig - The tool configuration to check.
   * @param toolName - The name of the tool.
   * @param logger - The logger instance.
   * @returns True if the tool has symlink configurations, false otherwise.
   */
  private shouldProcessTool(
    toolConfig: ToolConfig | undefined,
    toolName: string,
    logger: TsLogger
  ): toolConfig is ToolConfig & { symlinks: NonNullable<ToolConfig['symlinks']> } {
    const methodLogger = logger.getSubLogger({ name: 'shouldProcessTool' });
    if (!toolConfig) {
      methodLogger.debug(messages.generate.missingToolConfig(toolName));
      return false;
    }
    if (!toolConfig.symlinks || toolConfig.symlinks.length === 0) {
      methodLogger.debug(messages.generate.noSymlinks(toolName));
      return false;
    }
    return true;
  }

  /**
   * Processes a single symlink configuration.
   *
   * @param toolConfig - The tool configuration.
   * @param symlinkConfig - The symlink source and target configuration.
   * @param toolFs - The file system interface (may be tool-specific tracked FS).
   * @param options - Options for symlink generation.
   * @param logger - The logger instance.
   * @returns The result of the symlink operation.
   */
  private async processSymlink(
    toolConfig: ToolConfig,
    symlinkConfig: { source: string; target: string },
    toolFs: IFileSystem,
    options: GenerateSymlinksOptions,
    logger: TsLogger
  ): Promise<SymlinkOperationResult> {
    const methodLogger = logger.getSubLogger({ name: 'processSymlink' });
    const { overwrite = false, backup = false } = options;
    const sourceAbsPath = expandToolConfigPath(
      toolConfig.configFilePath,
      symlinkConfig.source,
      this.yamlConfig,
      this.systemInfo
    );
    const targetAbsPath = expandToolConfigPath(
      toolConfig.configFilePath,
      symlinkConfig.target,
      this.yamlConfig,
      this.systemInfo
    );

    methodLogger.debug(
      messages.process.symlinkDetails(symlinkConfig.source, sourceAbsPath, symlinkConfig.target, targetAbsPath),
      symlinkConfig.source,
      sourceAbsPath,
      symlinkConfig.target,
      targetAbsPath
    );

    if (!(await toolFs.exists(sourceAbsPath))) {
      methodLogger.warn(messages.process.sourceMissing(toolConfig.name, sourceAbsPath));
      const result: SymlinkOperationResult = {
        success: true,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: 'skipped_source_missing',
      };
      return result;
    }

    const targetHandlingResult = await this.handleExistingTarget(
      sourceAbsPath,
      targetAbsPath,
      toolFs,
      { overwrite, backup },
      methodLogger
    );

    if (targetHandlingResult.shouldSkip) {
      if (targetHandlingResult.status === 'failed') {
        const result: SymlinkOperationResult = {
          success: false,
          sourcePath: sourceAbsPath,
          targetPath: targetAbsPath,
          status: 'failed',
          error: targetHandlingResult.error ?? 'Unknown error',
        };
        return result;
      }
      const result: SymlinkOperationResult = {
        success: true,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: targetHandlingResult.status,
      };
      return result;
    }

    return await this.createSymlink(sourceAbsPath, targetAbsPath, toolFs, targetHandlingResult.status, methodLogger);
  }

  private async handleExistingTarget(
    sourceAbsPath: string,
    targetAbsPath: string,
    toolFs: IFileSystem,
    options: { overwrite: boolean; backup: boolean },
    logger: TsLogger
  ): Promise<
    | { shouldSkip: false; status: 'created' | 'updated_target' | 'backed_up' }
    | { shouldSkip: true; status: 'skipped_correct' | 'skipped_exists' | 'failed'; error?: string }
  > {
    const methodLogger = logger.getSubLogger({ name: 'handleExistingTarget' });
    const targetExists = await toolFs.exists(targetAbsPath);

    if (!targetExists) {
      return { shouldSkip: false, status: 'created' };
    }

    methodLogger.debug(messages.process.targetExists(targetAbsPath));

    const correctSymlinkResult = await this.checkCorrectSymlink(sourceAbsPath, targetAbsPath, toolFs);
    if (correctSymlinkResult.isCorrect) {
      return { shouldSkip: true, status: 'skipped_correct' };
    }

    if (!options.overwrite) {
      methodLogger.debug(messages.process.skipExistingTarget(targetAbsPath));
      return { shouldSkip: true, status: 'skipped_exists' };
    }

    return await this.handleOverwrite(targetAbsPath, toolFs, options.backup, methodLogger);
  }

  /**
   * Checks if a symlink already points to the correct source.
   *
   * @param sourceAbsPath - The absolute path to the source file.
   * @param targetAbsPath - The absolute path to the symlink.
   * @param toolFs - The file system interface.
   * @returns An object indicating whether the symlink is correct.
   */
  private async checkCorrectSymlink(
    sourceAbsPath: string,
    targetAbsPath: string,
    toolFs: IFileSystem
  ): Promise<{ isCorrect: boolean }> {
    try {
      const targetStat = await toolFs.lstat(targetAbsPath);
      if (targetStat.isSymbolicLink()) {
        const currentTarget = await toolFs.readlink(targetAbsPath);
        const resolvedCurrentTarget = path.resolve(path.dirname(targetAbsPath), currentTarget);
        const resolvedSourcePath = path.resolve(sourceAbsPath);
        return { isCorrect: resolvedCurrentTarget === resolvedSourcePath };
      }
    } catch {
      // If we can't check the symlink, proceed with normal logic
    }
    return { isCorrect: false };
  }

  /**
   * Handles overwriting an existing file or symlink at the target path.
   *
   * @param targetAbsPath - The absolute path to the target.
   * @param toolFs - The file system interface.
   * @param backup - Whether to backup the existing file.
   * @param logger - The logger instance.
   * @returns An object indicating whether to skip symlink creation and the status.
   */
  private async handleOverwrite(
    targetAbsPath: string,
    toolFs: IFileSystem,
    backup: boolean,
    logger: TsLogger
  ): Promise<
    | { shouldSkip: false; status: 'updated_target' | 'backed_up' }
    | { shouldSkip: true; status: 'failed'; error: string }
  > {
    const methodLogger = logger.getSubLogger({ name: 'handleOverwrite' });
    let status: SymlinkOperationResult['status'] = 'updated_target';

    if (backup) {
      const backupResult = await this.createBackup(targetAbsPath, toolFs, methodLogger);
      if (backupResult.failed) {
        return { shouldSkip: true, status: 'failed', error: backupResult.error };
      }
      status = 'backed_up';
    } else {
      const deleteResult = await this.deleteTarget(targetAbsPath, toolFs, methodLogger);
      if (deleteResult.failed) {
        return { shouldSkip: true, status: 'failed', error: deleteResult.error };
      }
    }

    return { shouldSkip: false, status };
  }

  /**
   * Creates a backup of the target file before overwriting.
   *
   * @param targetAbsPath - The absolute path to the target file.
   * @param toolFs - The file system interface.
   * @param logger - The logger instance.
   * @returns An object indicating success or failure with error message.
   */
  private async createBackup(
    targetAbsPath: string,
    toolFs: IFileSystem,
    logger: TsLogger
  ): Promise<{ failed: false } | { failed: true; error: string }> {
    const methodLogger = logger.getSubLogger({ name: 'createBackup' });
    const backupPath = `${targetAbsPath}.bak`;
    try {
      if (await toolFs.exists(backupPath)) {
        await toolFs.rm(backupPath, { recursive: true, force: true });
      }
      await toolFs.rename(targetAbsPath, backupPath);
      return { failed: false };
    } catch (error) {
      const errorMsg = messages.filesystem.backupFailed(targetAbsPath);
      methodLogger.error(errorMsg, error);
      return { failed: true, error: errorMsg };
    }
  }

  /**
   * Deletes the target file or directory before creating symlink.
   *
   * @param targetAbsPath - The absolute path to the target.
   * @param toolFs - The file system interface.
   * @param logger - The logger instance.
   * @returns An object indicating success or failure with error message.
   */
  private async deleteTarget(
    targetAbsPath: string,
    toolFs: IFileSystem,
    logger: TsLogger
  ): Promise<{ failed: false } | { failed: true; error: string }> {
    const methodLogger = logger.getSubLogger({ name: 'deleteTarget' });
    try {
      const targetStat = await toolFs.stat(targetAbsPath);
      const isDirectory = targetStat.isDirectory();

      if (isDirectory) {
        await toolFs.rm(targetAbsPath, { recursive: true, force: true });
      } else {
        await toolFs.rm(targetAbsPath, { force: true });
      }
      return { failed: false };
    } catch (error) {
      const errorMsg = messages.filesystem.deleteFailed(targetAbsPath);
      methodLogger.error(errorMsg, error);
      return { failed: true, error: errorMsg };
    }
  }

  /**
   * Creates a symbolic link from source to target.
   *
   * @param sourceAbsPath - The absolute path to the source file.
   * @param targetAbsPath - The absolute path where the symlink will be created.
   * @param toolFs - The file system interface.
   * @param status - The status to report in the result.
   * @param logger - The logger instance.
   * @returns The result of the symlink operation.
   */
  private async createSymlink(
    sourceAbsPath: string,
    targetAbsPath: string,
    toolFs: IFileSystem,
    status: 'created' | 'updated_target' | 'backed_up',
    logger: TsLogger
  ): Promise<SymlinkOperationResult> {
    const methodLogger = logger.getSubLogger({ name: 'createSymlink' });
    const targetDir = path.dirname(targetAbsPath);

    try {
      await toolFs.ensureDir(targetDir);
    } catch (error) {
      const errorMsg = messages.filesystem.directoryCreateFailed(targetDir);
      methodLogger.error(errorMsg, error);
      const result: SymlinkOperationResult = {
        success: false,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: 'failed',
        error: errorMsg,
      };
      return result;
    }

    try {
      await toolFs.symlink(sourceAbsPath, targetAbsPath);
      const result: SymlinkOperationResult = {
        success: true,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status,
      };
      return result;
    } catch (error) {
      const errorMsg = messages.filesystem.symlinkFailed(sourceAbsPath, targetAbsPath);
      methodLogger.error(errorMsg, error);
      const result: SymlinkOperationResult = {
        success: false,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: 'failed',
        error: errorMsg,
      };
      return result;
    }
  }
}
