import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { SystemInfo, ToolConfig } from '@types';
import { expandToolConfigPath } from '@utils';
import type { GenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from './ISymlinkGenerator';

export class SymlinkGenerator implements ISymlinkGenerator {
  private readonly fs: IFileSystem;
  private readonly yamlConfig: YamlConfig;
  private readonly systemInfo: SystemInfo;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, yamlConfig: YamlConfig, systemInfo: SystemInfo) {
    this.fs = fileSystem;
    this.yamlConfig = yamlConfig;
    this.systemInfo = systemInfo;
    this.logger = parentLogger.getSubLogger({ name: 'SymlinkGenerator' });
    this.logger.debug(logs.symlink.debug.constructorInit());
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options: GenerateSymlinksOptions = {}
  ): Promise<SymlinkOperationResult[]> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    logger.debug(logs.symlink.debug.generateStart(), options, this.fs.constructor.name);
    const results: SymlinkOperationResult[] = [];

    for (const toolName in toolConfigs) {
      const toolConfig = toolConfigs[toolName];
      if (!this.shouldProcessTool(toolConfig, toolName, logger)) {
        continue;
      }

      const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;
      logger.debug(logs.symlink.debug.processingTool(), toolName);

      for (const symlinkConfig of toolConfig.symlinks) {
        const result = await this.processSymlink(toolConfig, symlinkConfig, toolFs, options, logger);
        results.push(result);
      }
    }

    logger.debug(logs.symlink.debug.generationComplete(), results);
    return results;
  }

  private shouldProcessTool(
    toolConfig: ToolConfig | undefined,
    toolName: string,
    logger: TsLogger
  ): toolConfig is ToolConfig & { symlinks: NonNullable<ToolConfig['symlinks']> } {
    if (!toolConfig) {
      logger.debug(logs.symlink.debug.toolConfigUndefined(), toolName);
      return false;
    }
    if (!toolConfig.symlinks || toolConfig.symlinks.length === 0) {
      logger.debug(logs.symlink.debug.noSymlinks(), toolName);
      return false;
    }
    return true;
  }

  private async processSymlink(
    toolConfig: ToolConfig,
    symlinkConfig: { source: string; target: string },
    toolFs: IFileSystem,
    options: GenerateSymlinksOptions,
    logger: TsLogger
  ): Promise<SymlinkOperationResult> {
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

    logger.debug(
      logs.symlink.debug.processingSymlink(),
      symlinkConfig.source,
      sourceAbsPath,
      symlinkConfig.target,
      targetAbsPath
    );

    if (!(await toolFs.exists(sourceAbsPath))) {
      logger.warn(logs.symlink.warning.sourceNotFound(), toolConfig.name, sourceAbsPath);
      return {
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: 'skipped_source_missing',
      };
    }

    const targetHandlingResult = await this.handleExistingTarget(
      sourceAbsPath,
      targetAbsPath,
      toolFs,
      { overwrite, backup },
      logger
    );

    if (targetHandlingResult.shouldSkip) {
      return {
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: targetHandlingResult.status,
        error: targetHandlingResult.error,
      };
    }

    return await this.createSymlink(sourceAbsPath, targetAbsPath, toolFs, targetHandlingResult.status, logger);
  }

  private async handleExistingTarget(
    sourceAbsPath: string,
    targetAbsPath: string,
    toolFs: IFileSystem,
    options: { overwrite: boolean; backup: boolean },
    logger: TsLogger
  ): Promise<{ shouldSkip: boolean; status: SymlinkOperationResult['status']; error?: string }> {
    const targetExists = await toolFs.exists(targetAbsPath);

    if (!targetExists) {
      return { shouldSkip: false, status: 'created' };
    }

    logger.debug(logs.symlink.debug.targetExists(), targetAbsPath);

    const correctSymlinkResult = await this.checkCorrectSymlink(sourceAbsPath, targetAbsPath, toolFs);
    if (correctSymlinkResult.isCorrect) {
      return { shouldSkip: true, status: 'skipped_correct' };
    }

    if (!options.overwrite) {
      logger.debug(logs.symlink.debug.skipTargetExists(), targetAbsPath);
      return { shouldSkip: true, status: 'skipped_exists' };
    }

    return await this.handleOverwrite(targetAbsPath, toolFs, options.backup, logger);
  }

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

  private async handleOverwrite(
    targetAbsPath: string,
    toolFs: IFileSystem,
    backup: boolean,
    logger: TsLogger
  ): Promise<{ shouldSkip: boolean; status: SymlinkOperationResult['status']; error?: string }> {
    let status: SymlinkOperationResult['status'] = 'updated_target';

    if (backup) {
      const backupResult = await this.createBackup(targetAbsPath, toolFs, logger);
      if (backupResult.failed) {
        return { shouldSkip: true, status: 'failed', error: backupResult.error };
      }
      status = 'backed_up';
    } else {
      const deleteResult = await this.deleteTarget(targetAbsPath, toolFs, logger);
      if (deleteResult.failed) {
        return { shouldSkip: true, status: 'failed', error: deleteResult.error };
      }
    }

    return { shouldSkip: false, status };
  }

  private async createBackup(
    targetAbsPath: string,
    toolFs: IFileSystem,
    logger: TsLogger
  ): Promise<{ failed: boolean; error?: string }> {
    const backupPath = `${targetAbsPath}.bak`;
    try {
      if (await toolFs.exists(backupPath)) {
        await toolFs.rm(backupPath, { recursive: true, force: true });
      }
      await toolFs.rename(targetAbsPath, backupPath);
      return { failed: false };
    } catch (error) {
      const errorMsg = logs.fs.error.writeFailed(`backup of ${targetAbsPath}`, (error as Error).message);
      logger.error(errorMsg);
      return { failed: true, error: errorMsg };
    }
  }

  private async deleteTarget(
    targetAbsPath: string,
    toolFs: IFileSystem,
    logger: TsLogger
  ): Promise<{ failed: boolean; error?: string }> {
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
      const errorMsg = logs.fs.error.deleteFailed(targetAbsPath, (error as Error).message);
      logger.error(errorMsg);
      return { failed: true, error: errorMsg };
    }
  }

  private async createSymlink(
    sourceAbsPath: string,
    targetAbsPath: string,
    toolFs: IFileSystem,
    status: SymlinkOperationResult['status'],
    logger: TsLogger
  ): Promise<SymlinkOperationResult> {
    const targetDir = path.dirname(targetAbsPath);

    try {
      await toolFs.ensureDir(targetDir);
    } catch (error) {
      const errorMsg = logs.fs.error.directoryCreateFailed(targetDir, (error as Error).message);
      logger.error(errorMsg);
      return {
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: 'failed',
        error: errorMsg,
      };
    }

    try {
      await toolFs.symlink(sourceAbsPath, targetAbsPath);
      return {
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status,
      };
    } catch (error) {
      const errorMsg = logs.fs.error.symlinkFailed(sourceAbsPath, targetAbsPath, (error as Error).message);
      logger.error(errorMsg);
      return {
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: 'failed',
        error: errorMsg,
      };
    }
  }
}
