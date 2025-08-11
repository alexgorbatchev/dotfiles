import path from 'node:path';
import type { ToolConfig, CompletionConfig } from '@types';
import type { ShellScript } from '@types';
import type { YamlConfig } from '@modules/config';
import type { IShellStringProducer } from './BaseShellGenerator';
import { generateCompletionSetup } from '../shellTemplates';

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

  processCompletions(_toolName: string, completions: CompletionConfig): string[] {
    const completionSetup: string[] = [];
    
    if (completions.zsh) {
      const shellConfig = completions.zsh;
      const completionDir = shellConfig.targetDir ?? path.join(this.appConfig.paths.shellScriptsDir, 'zsh');
      
      // Add completion directory to fpath
      const fpathAdd = `fpath=(${JSON.stringify(completionDir)} $fpath)`;
      completionSetup.push(fpathAdd);
    }

    return completionSetup;
  }

  generateCompletionSetup(allCompletionSetup: string[], allToolInits: string[]): string[] {
    // Check if any tool already has typeset -U fpath in their tool init
    const hasTypesetInToolInit = allToolInits.some(line => line.includes('typeset -U fpath'));
    
    // Add shell-specific completion setup
    const shellCompletionSetup = generateCompletionSetup('zsh', path.join(this.appConfig.paths.shellScriptsDir, 'zsh'));
    
    // If typeset is already in tool init, filter it out from shell completion setup
    const filteredShellSetup = hasTypesetInToolInit 
      ? shellCompletionSetup.filter(line => !line.includes('typeset -U fpath'))
      : shellCompletionSetup;
    
    const allSetup = [...filteredShellSetup, ...allCompletionSetup];
    return [...new Set(allSetup)];
  }
}