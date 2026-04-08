import type { ProjectConfig } from "@dotfiles/config";
import type { ISystemInfo, ToolConfig } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { TrackedFileSystem } from "@dotfiles/registry/file";
import { expandToolConfigPath, resolvePlatformConfig } from "@dotfiles/utils";
import path from "node:path";
import type { CopyOperationResult, ICopyGenerator, IGenerateCopiesOptions } from "./ICopyGenerator";
import { messages } from "./log-messages";
import type { ToolConfigWithCopies } from "./types";

/** Configuration for a single copy mapping from source to target */
interface ICopyConfig {
  source: string;
  target: string;
}

/** Status values for successful copy creation operations */
type CopyCreationStatus = "created" | "updated_target" | "backed_up";
type CopyCreationResult = { failed: false; status: CopyCreationStatus } | { failed: true; error: string };

/**
 * Service that copies files for dotfiles.
 *
 * This class handles copying files and directories from source locations (in the dotfiles repository)
 * to target locations (typically in the user's home directory). It supports overwriting
 * existing files, creating backups, and tracking which copies belong to which tools.
 */
export class CopyGenerator implements ICopyGenerator {
  private readonly fs: IFileSystem;
  private readonly projectConfig: ProjectConfig;
  private readonly systemInfo: ISystemInfo;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, projectConfig: ProjectConfig, systemInfo: ISystemInfo) {
    this.fs = fileSystem;
    this.projectConfig = projectConfig;
    this.systemInfo = systemInfo;
    this.logger = parentLogger.getSubLogger({ name: "CopyGenerator" });
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options: IGenerateCopiesOptions = {},
  ): Promise<CopyOperationResult[]> {
    const logger = this.logger.getSubLogger({ name: "generate" });
    const results: CopyOperationResult[] = [];

    for (const toolName in toolConfigs) {
      const toolConfig = toolConfigs[toolName];
      if (!toolConfig) {
        continue;
      }

      const resolvedToolConfig = resolvePlatformConfig(toolConfig, this.systemInfo);
      if (!this.shouldProcessTool(resolvedToolConfig, toolName, logger)) {
        continue;
      }

      const toolLogger = logger.getSubLogger({ context: toolName });
      const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;
      toolLogger.debug(messages.copy.processingTool(toolName));

      for (const copyConfig of resolvedToolConfig.copies) {
        const result = await this.processCopy(resolvedToolConfig, copyConfig, toolFs, options, toolLogger);
        results.push(result);
      }
    }

    return results;
  }

  private shouldProcessTool(
    toolConfig: ToolConfig | undefined,
    toolName: string,
    logger: TsLogger,
  ): toolConfig is ToolConfigWithCopies {
    const methodLogger = logger.getSubLogger({ name: "shouldProcessTool" });
    if (!toolConfig) {
      methodLogger.debug(messages.copy.missingToolConfig(toolName));
      return false;
    }
    if (!toolConfig.copies || toolConfig.copies.length === 0) {
      return false;
    }
    return true;
  }

  private async processCopy(
    toolConfig: ToolConfig,
    copyConfig: ICopyConfig,
    toolFs: IFileSystem,
    options: IGenerateCopiesOptions,
    logger: TsLogger,
  ): Promise<CopyOperationResult> {
    const methodLogger = logger.getSubLogger({ name: "processCopy" });
    const { overwrite = false, backup = false } = options;
    const sourceAbsPath = expandToolConfigPath(
      toolConfig.configFilePath,
      copyConfig.source,
      this.projectConfig,
      this.systemInfo,
    );
    const targetAbsPath = expandToolConfigPath(
      toolConfig.configFilePath,
      copyConfig.target,
      this.projectConfig,
      this.systemInfo,
    );

    methodLogger.debug(messages.copy.copyDetails(copyConfig.source, sourceAbsPath, copyConfig.target, targetAbsPath));

    if (!(await toolFs.exists(sourceAbsPath))) {
      methodLogger.error(messages.copy.sourceMissing(toolConfig.name, sourceAbsPath));
      return {
        success: false,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: "failed",
        error: messages.copy.sourceMissing(toolConfig.name, sourceAbsPath),
      };
    }

    const targetExists = await toolFs.exists(targetAbsPath);
    if (targetExists) {
      methodLogger.debug(messages.copy.targetExists(targetAbsPath));

      if (!overwrite) {
        methodLogger.debug(messages.copy.skipExistingTarget(targetAbsPath));
        return {
          success: true,
          sourcePath: sourceAbsPath,
          targetPath: targetAbsPath,
          status: "skipped_exists",
        };
      }

      // Handle overwrite with optional backup
      const overwriteResult = await this.handleOverwrite(targetAbsPath, toolFs, backup, methodLogger);
      if (overwriteResult.failed) {
        return {
          success: false,
          sourcePath: sourceAbsPath,
          targetPath: targetAbsPath,
          status: "failed",
          error: overwriteResult.error,
        };
      }

      return this.performCopy(sourceAbsPath, targetAbsPath, toolFs, overwriteResult.status, methodLogger);
    }

    return this.performCopy(sourceAbsPath, targetAbsPath, toolFs, "created", methodLogger);
  }

  private async handleOverwrite(
    targetAbsPath: string,
    toolFs: IFileSystem,
    shouldBackup: boolean,
    logger: TsLogger,
  ): Promise<CopyCreationResult> {
    if (shouldBackup) {
      const backupPath = `${targetAbsPath}.bak`;
      try {
        if (await toolFs.exists(backupPath)) {
          await toolFs.rm(backupPath, { recursive: true, force: true });
        }
        await toolFs.rename(targetAbsPath, backupPath);
        return { failed: false, status: "backed_up" };
      } catch {
        const errorMsg = messages.filesystem.backupFailed(targetAbsPath);
        logger.error(errorMsg);
        return { failed: true, error: errorMsg };
      }
    }

    try {
      const targetStat = await toolFs.stat(targetAbsPath);
      if (targetStat.isDirectory()) {
        await toolFs.rm(targetAbsPath, { recursive: true, force: true });
      } else {
        await toolFs.rm(targetAbsPath, { force: true });
      }
      return { failed: false, status: "updated_target" };
    } catch {
      const errorMsg = messages.filesystem.deleteFailed(targetAbsPath);
      logger.error(errorMsg);
      return { failed: true, error: errorMsg };
    }
  }

  private async performCopy(
    sourceAbsPath: string,
    targetAbsPath: string,
    toolFs: IFileSystem,
    status: CopyCreationStatus,
    logger: TsLogger,
  ): Promise<CopyOperationResult> {
    const methodLogger = logger.getSubLogger({ name: "performCopy" });
    const targetDir = path.dirname(targetAbsPath);

    try {
      await toolFs.ensureDir(targetDir);
    } catch {
      const errorMsg = messages.filesystem.directoryCreateFailed(targetDir);
      methodLogger.error(errorMsg);
      return {
        success: false,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: "failed",
        error: errorMsg,
      };
    }

    try {
      const sourceStat = await toolFs.stat(sourceAbsPath);
      if (sourceStat.isDirectory()) {
        await this.copyDirectory(sourceAbsPath, targetAbsPath, toolFs);
      } else {
        await toolFs.copyFile(sourceAbsPath, targetAbsPath);
      }

      return {
        success: true,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status,
      };
    } catch {
      const errorMsg = messages.copy.copyFailed(sourceAbsPath, targetAbsPath);
      methodLogger.error(errorMsg);
      return {
        success: false,
        sourcePath: sourceAbsPath,
        targetPath: targetAbsPath,
        status: "failed",
        error: errorMsg,
      };
    }
  }

  private async copyDirectory(sourceDir: string, targetDir: string, toolFs: IFileSystem): Promise<void> {
    await toolFs.ensureDir(targetDir);
    const entries = await toolFs.readdir(sourceDir);

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry);
      const targetPath = path.join(targetDir, entry);
      const stat = await toolFs.stat(sourcePath);

      if (stat.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath, toolFs);
      } else {
        await toolFs.copyFile(sourcePath, targetPath);
      }
    }
  }
}
