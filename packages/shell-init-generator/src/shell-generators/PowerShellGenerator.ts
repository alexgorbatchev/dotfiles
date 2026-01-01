import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellType, ToolConfig } from '@dotfiles/core';
import { BaseShellGenerator } from './BaseShellGenerator';
import { PowerShellStringProducer } from './PowerShellStringProducer';

/**
 * PowerShell-specific shell initialization generator.
 * Handles PowerShell syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class PowerShellGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'powershell';
  readonly fileExtension: string = '.ps1';

  constructor(projectConfig: ProjectConfig) {
    super(projectConfig, new PowerShellStringProducer(projectConfig));
  }

  protected getShellConfig(
    toolConfig: ToolConfig
  ): { completions?: ShellCompletionConfig; functions?: Record<string, string> } | undefined {
    return toolConfig.shellConfigs?.powershell;
  }
}
