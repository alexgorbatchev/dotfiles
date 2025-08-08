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
    return toolConfig.bashInit || [];
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
}