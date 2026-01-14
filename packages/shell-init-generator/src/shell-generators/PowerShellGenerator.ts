import type { ProjectConfig } from '@dotfiles/config';
import type { ShellCompletionConfigInput, ShellType, ToolConfig } from '@dotfiles/core';
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
    toolConfig: ToolConfig,
  ): { completions?: ShellCompletionConfigInput; functions?: Record<string, string>; } | undefined {
    const shellConfig = toolConfig.shellConfigs?.powershell;
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
