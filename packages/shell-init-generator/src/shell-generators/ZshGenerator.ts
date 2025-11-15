import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellType, ToolConfig } from '@dotfiles/core';
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

  protected getShellConfig(toolConfig: ToolConfig): { completions?: ShellCompletionConfig } | undefined {
    return toolConfig.shellConfigs?.zsh;
  }
}
