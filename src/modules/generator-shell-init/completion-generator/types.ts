import type { ShellCompletionConfig, ShellType } from '@types';
import type { $ } from 'zx';

export interface CompletionGenerationContext {
  toolName: string;
  toolInstallDir: string;
  shellScriptsDir: string;
  homeDir: string;
}

export interface GeneratedCompletion {
  content: string;
  filename: string;
  targetPath: string;
  generatedBy: 'command' | 'source';
}

export interface ICompletionCommandExecutor {
  executeCompletionCommand(
    cmd: string,
    toolName: string,
    shellType: ShellType,
    workingDir: string,
    zxInstance?: typeof $
  ): Promise<string>;
}

export interface ICompletionGenerator {
  generateCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: CompletionGenerationContext
  ): Promise<GeneratedCompletion>;
}
