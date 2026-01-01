import type { ICompletionContext, ShellCompletionConfig, ShellType } from '@dotfiles/core';

/**
 * Context for completion generation, extending the base completion context.
 * Used by the completion generator when processing completions after installation.
 */
export interface ICompletionGenerationContext extends ICompletionContext {
  /** Name of the tool being configured */
  toolName: string;
  /** Absolute path to the tool's installation directory */
  toolInstallDir: string;
  /** Absolute path to the generated shell scripts directory */
  shellScriptsDir: string;
  /** User's home directory path */
  homeDir: string;
  /** Absolute path to the tool's configuration file */
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
