import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { ShellCompletionConfig, ShellScript, ToolConfig } from '@dotfiles/schemas';
import { generateCompletionSetup } from '../shellTemplates';
import type { IShellStringProducer } from './BaseShellGenerator';

/**
 * Zsh-specific string producer for shell initialization generation.
 * Handles Zsh syntax and conventions for completions and script extraction.
 */
export class ZshStringProducer implements IShellStringProducer {
  private readonly appConfig: YamlConfig;

  constructor(appConfig: YamlConfig) {
    this.appConfig = appConfig;
  }

  extractInitScripts(toolConfig: ToolConfig): ShellScript[] {
    return toolConfig.shellConfigs?.zsh?.scripts || [];
  }

  processCompletions(_toolName: string, completions: ShellCompletionConfig): string[] {
    const completionSetup: string[] = [];

    if (completions.cmd || completions.source) {
      const defaultSubdir = completions.cmd ? 'completions' : '';
      const completionDir =
        completions.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'zsh', defaultSubdir);
      const fpathAdd = `fpath=(${JSON.stringify(completionDir)} $fpath)`;
      completionSetup.push(fpathAdd);
    }

    return completionSetup;
  }

  processEnvironmentVariables(toolConfig: ToolConfig): string[] {
    const envVars: string[] = [];

    if (toolConfig.shellConfigs?.zsh?.environment) {
      const environment = toolConfig.shellConfigs.zsh.environment;
      for (const [key, value] of Object.entries(environment)) {
        envVars.push(`export ${key}=${JSON.stringify(value)}`);
      }
    }

    return envVars;
  }

  processAliases(toolConfig: ToolConfig): string[] {
    const aliases: string[] = [];

    if (toolConfig.shellConfigs?.zsh?.aliases) {
      const aliasConfig = toolConfig.shellConfigs.zsh.aliases;
      for (const [alias, command] of Object.entries(aliasConfig)) {
        aliases.push(`alias ${alias}=${JSON.stringify(command)}`);
      }
    }

    return aliases;
  }

  generateCompletionSetup(allCompletionSetup: string[], allToolInits: string[]): string[] {
    // Check if any tool already has typeset -U fpath in their tool init
    const hasTypesetInToolInit = allToolInits.some((line) => line.includes('typeset -U fpath'));

    // Add shell-specific completion setup
    const shellCompletionSetup = generateCompletionSetup('zsh', path.join(this.appConfig.paths.shellScriptsDir, 'zsh'));

    // If typeset is already in tool init, filter it out from shell completion setup
    const filteredShellSetup = hasTypesetInToolInit
      ? shellCompletionSetup.filter((line) => !line.includes('typeset -U fpath'))
      : shellCompletionSetup;

    const allSetup = [...filteredShellSetup, ...allCompletionSetup];
    return [...new Set(allSetup)];
  }
}
