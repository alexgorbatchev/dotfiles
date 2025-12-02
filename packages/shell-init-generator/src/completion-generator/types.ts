import type { ShellCompletionConfig, ShellType } from '@dotfiles/core';

export interface ICompletionGenerationContext {
  toolName: string;
  toolInstallDir: string;
  shellScriptsDir: string;
  homeDir: string;
}

export interface IGeneratedCompletion {
  content: string;
  filename: string;
  targetPath: string;
  generatedBy: 'command' | 'source';
}

export interface ICompletionCommandExecutor {
  executeCompletionCommand(cmd: string, toolName: string, shellType: ShellType, workingDir: string): Promise<string>;
}

export interface ICompletionGenerator {
  generateCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion>;

  generateAndWriteCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext
  ): Promise<IGeneratedCompletion>;
}
