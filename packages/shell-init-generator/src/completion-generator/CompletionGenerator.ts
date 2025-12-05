import path from 'node:path';
import type { ShellCompletionConfig, ShellType } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { getAllFilesRecursively } from '@dotfiles/utils';
import { minimatch } from 'minimatch';
import { CompletionCommandExecutor } from './CompletionCommandExecutor';
import { messages } from './log-messages';
import type {
  ICompletionCommandExecutor,
  ICompletionGenerationContext,
  ICompletionGenerator,
  IGeneratedCompletion,
} from './types';

export class CompletionGenerator implements ICompletionGenerator {
  private readonly logger: TsLogger;
  private readonly commandExecutor: ICompletionCommandExecutor;
  private readonly fs: IFileSystem;

  constructor(parentLogger: TsLogger, fs: IFileSystem, commandExecutor?: ICompletionCommandExecutor) {
    this.logger = parentLogger.getSubLogger({ name: 'CompletionGenerator' });
    this.fs = fs;
    this.commandExecutor = commandExecutor || new CompletionCommandExecutor(this.logger);
  }

  async generateCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion> {
    const logger = this.logger.getSubLogger({ name: 'generateCompletionFile' }).setPrefix(toolName);
    logger.debug(messages.generationStarted(toolName, shellType));

    if (config.cmd) {
      return this.generateFromCommand(config, toolName, shellType, context);
    } else if (config.source) {
      return this.generateFromSource(config, toolName, shellType, context);
    } else {
      throw new Error(`Invalid completion config for ${toolName}: either 'cmd' or 'source' must be provided`);
    }
  }

  /**
   * Generates and writes a completion file in one operation.
   * For command-based completions, writes the generated content to a file.
   * For source-based completions, creates a symlink to the source file.
   */
  async generateAndWriteCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion> {
    const result = await this.generateCompletionFile(config, toolName, shellType, context);

    await this.fs.ensureDir(path.dirname(result.targetPath));

    if (result.generatedBy === 'source' && result.sourcePath) {
      // For source-based completions, create a symlink
      if (await this.fs.exists(result.targetPath)) {
        await this.fs.rm(result.targetPath);
      }
      await this.fs.symlink(result.sourcePath, result.targetPath);
      this.logger.debug(messages.symlinkCreated(result.sourcePath, result.targetPath));
    } else {
      // For command-based completions, write the content
      await this.fs.writeFile(result.targetPath, result.content);
    }

    return result;
  }

  private async generateFromCommand(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion> {
    if (!config.cmd) {
      throw new Error(`Command not provided for ${toolName}`);
    }

    const content = await this.commandExecutor.executeCompletionCommand(
      config.cmd,
      toolName,
      shellType,
      context.toolInstallDir
    );

    const filename = this.generateCompletionFilename(config, toolName, shellType);
    const targetPath = this.resolveTargetPath(config.targetDir, shellType, context);

    return {
      content,
      filename,
      targetPath: path.join(targetPath, filename),
      generatedBy: 'command',
    };
  }

  private async generateFromSource(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion> {
    if (!config.source) {
      throw new Error(`Source not provided for ${toolName}`);
    }

    const sourcePath = await this.resolveSourcePath(context.toolInstallDir, config.source, context.configFilePath);

    if (!(await this.fs.exists(sourcePath))) {
      this.logger.warn(messages.sourceNotFound(sourcePath));
      throw new Error(`Completion source file not found: ${sourcePath}`);
    }

    const filename = this.generateCompletionFilename(config, toolName, shellType);
    const targetPath = this.resolveTargetPath(config.targetDir, shellType, context);

    return {
      content: '', // No content needed for symlink-based completions
      filename,
      targetPath: path.join(targetPath, filename),
      generatedBy: 'source',
      sourcePath,
    };
  }

  /**
   * Resolves the source path for a completion file.
   *
   * Supports glob patterns (*, ?, []) for flexible file matching.
   * Falls back to config file directory if not found in install directory.
   */
  private async resolveSourcePath(installDir: string, source: string, configFilePath?: string): Promise<string> {
    // If source contains glob patterns, resolve using minimatch
    if (source.includes('*') || source.includes('?') || source.includes('[')) {
      const allFiles = await getAllFilesRecursively(this.fs, installDir, installDir);
      const matched = allFiles.find((file) => minimatch(file, source));
      if (matched) {
        return path.join(installDir, matched);
      }
    }

    let sourcePath = path.join(installDir, source);

    // If not found in installDir, try relative to config file
    if (!(await this.fs.exists(sourcePath)) && configFilePath) {
      const configDir = path.dirname(configFilePath);
      const localPath = path.resolve(configDir, source);
      if (await this.fs.exists(localPath)) {
        sourcePath = localPath;
      }
    }

    return sourcePath;
  }

  /**
   * Generates the completion filename based on config and shell type.
   *
   * Priority order:
   * 1. config.name - explicit full filename override
   * 2. config.bin - binary name with shell-specific naming applied
   * 3. toolName - fallback to tool name with shell-specific naming
   */
  private generateCompletionFilename(config: ShellCompletionConfig, toolName: string, shellType: ShellType): string {
    if (config.name) {
      return config.name;
    }

    const baseName = config.bin ?? toolName;

    switch (shellType) {
      case 'zsh':
        return `_${baseName}`;
      case 'bash':
        return `${baseName}.bash`;
      case 'powershell':
        return `${baseName}.ps1`;
      default:
        return `${baseName}.${shellType}`;
    }
  }

  private resolveTargetPath(
    customTargetDir: string | undefined,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): string {
    if (customTargetDir) {
      return customTargetDir;
    }

    return path.join(context.shellScriptsDir, shellType, 'completions');
  }
}
