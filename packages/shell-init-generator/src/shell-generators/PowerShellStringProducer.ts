import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellScript, ToolConfig } from '@dotfiles/core';
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
    return toolConfig.shellConfigs?.powershell?.scripts || [];
  }

  processCompletions(toolName: string, completions: ShellCompletionConfig): string[] {
    const completionSetup: string[] = [];

    if (completions.cmd || completions.source) {
      const defaultSubdir = completions.cmd ? 'completions' : '';
      const completionDir =
        completions.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'powershell', defaultSubdir);
      const completionFile = path.join(completionDir, completions.name ?? `${toolName}.ps1`);
      completionSetup.push(`if (Test-Path "${completionFile}") { . "${completionFile}" }`);
    }

    return completionSetup;
  }

  processEnvironmentVariables(toolConfig: ToolConfig): string[] {
    const envVars: string[] = [];

    if (toolConfig.shellConfigs?.powershell?.environment) {
      const environment = toolConfig.shellConfigs.powershell.environment;
      for (const [key, value] of Object.entries(environment)) {
        envVars.push(`$env:${key} = ${JSON.stringify(value)}`);
      }
    }

    return envVars;
  }

  processAliases(toolConfig: ToolConfig): string[] {
    const aliases: string[] = [];

    if (toolConfig.shellConfigs?.powershell?.aliases) {
      const aliasConfig = toolConfig.shellConfigs.powershell.aliases;
      for (const [alias, command] of Object.entries(aliasConfig)) {
        aliases.push(`Set-Alias ${alias} ${JSON.stringify(command)}`);
      }
    }

    return aliases;
  }
}
