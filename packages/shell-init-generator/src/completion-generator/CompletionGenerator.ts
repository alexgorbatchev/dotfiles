import path from 'node:path';
import type { ShellCompletionConfig, ShellType } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
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
    this.logger.debug(messages.generationStarted(toolName, shellType));

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
   * This is a convenience method that combines generation and file writing.
   */
  async generateAndWriteCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion> {
    const result = await this.generateCompletionFile(config, toolName, shellType, context);

    // Write the completion file
    await this.fs.ensureDir(path.dirname(result.targetPath));
    await this.fs.writeFile(result.targetPath, result.content);

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

    const filename = this.generateCompletionFilename(config.name, toolName, shellType);
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

    const sourcePath = path.join(context.toolInstallDir, config.source);

    try {
      // TODO don't think real fs supposed to be used here
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(sourcePath, 'utf-8');

      const filename = this.generateCompletionFilename(config.name, toolName, shellType);
      const targetPath = this.resolveTargetPath(config.targetDir, shellType, context);

      return {
        content,
        filename,
        targetPath: path.join(targetPath, filename),
        generatedBy: 'source',
      };
    } catch (error: unknown) {
      throw new Error(
        `Failed to read completion source file for ${toolName}: ${sourcePath}\n${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private generateCompletionFilename(customName: string | undefined, toolName: string, shellType: ShellType): string {
    if (customName) {
      return customName;
    }

    switch (shellType) {
      case 'zsh':
        return `_${toolName}`;
      case 'bash':
        return `${toolName}.bash`;
      case 'powershell':
        return `${toolName}.ps1`;
      default:
        return `${toolName}.${shellType}`;
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
