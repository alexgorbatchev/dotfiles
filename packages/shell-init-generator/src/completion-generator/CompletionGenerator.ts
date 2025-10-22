import path from 'node:path';
import type { TsLogger } from '@dotfiles/logger';
import type { ShellCompletionConfig, ShellType } from '@dotfiles/schemas';
import { CompletionCommandExecutor } from './CompletionCommandExecutor';
import { completionGeneratorLogMessages } from './log-messages';
import type {
  CompletionGenerationContext,
  GeneratedCompletion,
  ICompletionCommandExecutor,
  ICompletionGenerator,
} from './types';

export class CompletionGenerator implements ICompletionGenerator {
  private readonly logger: TsLogger;
  private readonly commandExecutor: ICompletionCommandExecutor;

  constructor(parentLogger: TsLogger, commandExecutor?: ICompletionCommandExecutor) {
    this.logger = parentLogger.getSubLogger({ name: 'CompletionGenerator' });
    this.commandExecutor = commandExecutor || new CompletionCommandExecutor(this.logger);
  }

  async generateCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: CompletionGenerationContext
  ): Promise<GeneratedCompletion> {
    this.logger.debug(completionGeneratorLogMessages.generationStarted(toolName, shellType));

    if (config.cmd) {
      return this.generateFromCommand(config, toolName, shellType, context);
    } else if (config.source) {
      return this.generateFromSource(config, toolName, shellType, context);
    } else {
      throw new Error(`Invalid completion config for ${toolName}: either 'cmd' or 'source' must be provided`);
    }
  }

  private async generateFromCommand(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: CompletionGenerationContext
  ): Promise<GeneratedCompletion> {
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
    context: CompletionGenerationContext
  ): Promise<GeneratedCompletion> {
    if (!config.source) {
      throw new Error(`Source not provided for ${toolName}`);
    }

    const sourcePath = path.join(context.toolInstallDir, config.source);

    try {
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
    context: CompletionGenerationContext
  ): string {
    if (customTargetDir) {
      return customTargetDir;
    }

    return path.join(context.shellScriptsDir, shellType, 'completions');
  }
}
