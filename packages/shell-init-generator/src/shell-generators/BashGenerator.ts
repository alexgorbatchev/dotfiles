import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellType, ToolConfig } from '@dotfiles/core';
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

  protected getShellConfig(toolConfig: ToolConfig): { completions?: ShellCompletionConfig } | undefined {
    return toolConfig.shellConfigs?.bash;
  }
}
