import path from 'node:path';
import type { ToolConfig, CompletionConfig } from '@types';
import type { ShellScript } from '@types';
import type { YamlConfig } from '@modules/config';
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

  processCompletions(toolName: string, completions: CompletionConfig): string[] {
    const completionSetup: string[] = [];
    
    if (completions.bash) {
      const shellConfig = completions.bash;
      const completionDir = shellConfig.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'bash');
      const completionFile = path.join(completionDir, shellConfig.name ?? `${toolName}.bash`);
      
      // Source the completion file
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