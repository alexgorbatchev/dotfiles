import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfigInput, ShellType, ToolConfig } from '@dotfiles/core';
import { BaseShellGenerator } from './BaseShellGenerator';
import { BashStringProducer } from './BashStringProducer';

/**
 * Bash-specific shell initialization generator.
 * Handles Bash syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class BashGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'bash';
  readonly fileExtension: string = '.bash';

  constructor(projectConfig: ProjectConfig) {
    super(projectConfig, new BashStringProducer(projectConfig));
  }

  protected getShellConfig(
    toolConfig: ToolConfig
  ): { completions?: ShellCompletionConfigInput; functions?: Record<string, string> } | undefined {
    const shellConfig = toolConfig.shellConfigs?.bash;
    if (!shellConfig) {
      return undefined;
    }
    // Cast completions since Zod schema uses z.unknown() but runtime type is ShellCompletionConfigInput
    const result: { completions?: ShellCompletionConfigInput; functions?: Record<string, string> } = {
      completions: shellConfig.completions as ShellCompletionConfigInput | undefined,
      functions: shellConfig.functions,
    };
    return result;
  }
}
