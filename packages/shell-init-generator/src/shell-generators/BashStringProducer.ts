import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellScript, ToolConfig } from '@dotfiles/core';
import type { IShellStringProducer } from './BaseShellGenerator';

/**
 * Bash-specific string producer for shell initialization generation.
 * Handles Bash syntax and conventions for completions and script extraction.
 */
export class BashStringProducer implements IShellStringProducer {
  private readonly appConfig: YamlConfig;

  constructor(appConfig: YamlConfig) {
    this.appConfig = appConfig;
  }

  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.shellConfigs?.bash?.scripts || [];
  }

  processCompletions(toolName: string, completions: ShellCompletionConfig): string[] {
    const completionSetup: string[] = [];

    if (completions.cmd || completions.source) {
      const defaultSubdir = completions.cmd ? 'completions' : '';
      const completionDir =
        completions.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'bash', defaultSubdir);
      const completionFile = path.join(completionDir, completions.name ?? `${toolName}.bash`);
      completionSetup.push(`[[ -f "${completionFile}" ]] && source "${completionFile}"`);
    }

    return completionSetup;
  }

  processEnvironmentVariables(toolConfig: ToolConfig): string[] {
    const envVars: string[] = [];

    if (toolConfig.shellConfigs?.bash?.environment) {
      const environment = toolConfig.shellConfigs.bash.environment;
      for (const [key, value] of Object.entries(environment)) {
        envVars.push(`export ${key}=${JSON.stringify(value)}`);
      }
    }

    return envVars;
  }

  processAliases(toolConfig: ToolConfig): string[] {
    const aliases: string[] = [];

    if (toolConfig.shellConfigs?.bash?.aliases) {
      const aliasConfig = toolConfig.shellConfigs.bash.aliases;
      for (const [alias, command] of Object.entries(aliasConfig)) {
        aliases.push(`alias ${alias}=${JSON.stringify(command)}`);
      }
    }

    return aliases;
  }
}
