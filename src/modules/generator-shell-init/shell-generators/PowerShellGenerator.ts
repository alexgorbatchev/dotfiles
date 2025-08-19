import type { YamlConfig } from '@modules/config';
import type { ShellCompletionConfig, ShellType, ToolConfig } from '@types';
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

  constructor(appConfig: YamlConfig) {
    super(appConfig, new PowerShellStringProducer(appConfig));
  }

  protected getShellConfig(toolConfig: ToolConfig): { completions?: ShellCompletionConfig } | undefined {
    return toolConfig.shellConfigs?.powershell;
  }
}
