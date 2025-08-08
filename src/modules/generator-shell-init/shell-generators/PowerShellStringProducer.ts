import path from 'node:path';
import type { ToolConfig, CompletionConfig } from '@types';
import type { ShellScript } from '@types';
import type { YamlConfig } from '@modules/config';
import type { IShellStringProducer } from './BaseShellGenerator';

/**
 * PowerShell-specific string producer for shell initialization generation.
 * Handles PowerShell syntax and conventions for completions and script extraction.
 */
export class PowerShellStringProducer implements IShellStringProducer {
  private readonly appConfig: YamlConfig;

  constructor(appConfig: YamlConfig) {
    this.appConfig = appConfig;
  }

  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.powershellInit || [];
  }

  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    const completionSetup: string[] = [];
    
    if (completions.powershell) {
      const shellConfig = completions.powershell;
      const completionDir = shellConfig.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'powershell');
      const completionFile = path.join(completionDir, shellConfig.name ?? `${toolName}.ps1`);
      
      // Source the completion file if it exists
      completionSetup.push(`if (Test-Path "${completionFile}") { . "${completionFile}" }`);
    }

    return completionSetup;
  }
}