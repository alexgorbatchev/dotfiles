import type { ShellCompletionConfig, ShellType } from '@dotfiles/core';

export interface ICompletionGenerationContext {
  toolName: string;
  toolInstallDir: string;
  shellScriptsDir: string;
  homeDir: string;
  /** Optional path to the tool's config file, used for resolving relative source paths */
  configFilePath?: string;
}

export interface IGeneratedCompletion {
  /** Content of completion file (only set for command-based completions) */
  content: string;
  filename: string;
  targetPath: string;
  generatedBy: 'command' | 'source';
  /** Source path for symlink (only set for source-based completions) */
  sourcePath?: string;
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
