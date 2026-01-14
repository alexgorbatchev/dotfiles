import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfigInput, ShellType, ToolConfig } from '@dotfiles/core';
import { BaseShellGenerator } from './BaseShellGenerator';
import { ZshStringProducer } from './ZshStringProducer';

/**
 * Zsh-specific shell initialization generator.
 * Handles Zsh syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class ZshGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'zsh';
  readonly fileExtension: string = '.zsh';

  constructor(projectConfig: ProjectConfig) {
    super(projectConfig, new ZshStringProducer(projectConfig));
  }

  protected getShellConfig(
    toolConfig: ToolConfig,
  ): { completions?: ShellCompletionConfigInput; functions?: Record<string, string>; } | undefined {
    const shellConfig = toolConfig.shellConfigs?.zsh;
    if (!shellConfig) {
      return undefined;
    }
    // Cast completions since Zod schema uses z.unknown() but runtime type is ShellCompletionConfigInput
    const result: { completions?: ShellCompletionConfigInput; functions?: Record<string, string>; } = {
      completions: shellConfig.completions as ShellCompletionConfigInput | undefined,
      functions: shellConfig.functions,
    };
    return result;
  }
}
