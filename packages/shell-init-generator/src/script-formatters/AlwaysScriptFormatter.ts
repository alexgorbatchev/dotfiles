import type { ShellScript, ShellType } from '@dotfiles/core';
import { getScriptContent, isAlwaysScript } from '@dotfiles/core';
import { dedentString } from '@dotfiles/utils';
import type { IFormattedScriptOutput, IScriptFormatter } from './IScriptFormatter';

/**
 * Formatter for always scripts - wraps them in subshells (bash/zsh) or try-finally blocks (PowerShell)
 * to prevent variable pollution in the parent shell
 */
export class AlwaysScriptFormatter implements IScriptFormatter {
  format(script: ShellScript, _toolName: string, shellType: ShellType): IFormattedScriptOutput {
    if (!isAlwaysScript(script)) {
      throw new Error(`AlwaysScriptFormatter can only format AlwaysScript, received: ${typeof script}`);
    }

    const scriptContent = getScriptContent(script);

    const formattedContent = this.generateFormattedScript(scriptContent, shellType);

    return {
      content: formattedContent,
      requiresExecution: false, // Always scripts are executed inline
    };
  }

  private generateFormattedScript(scriptContent: string, shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
      case 'bash':
        return this.generateShScript(scriptContent);
      case 'powershell':
        return this.generatePowerShellScript(scriptContent);
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  private generateShScript(scriptContent: string): string {
    // Indent the script content for proper subshell formatting
    // Don't add indentation to empty lines to avoid trailing whitespace
    const indentedContent = scriptContent
      .split('\n')
      .map((line) => (line.trim() ? `  ${line}` : ''))
      .join('\n');

    return dedentString(`
      (
      ${indentedContent}
      )
    `);
  }

  private generatePowerShellScript(scriptContent: string): string {
    // Indent the script content for proper try-finally formatting
    // Don't add indentation to empty lines to avoid trailing whitespace
    const indentedContent = scriptContent
      .split('\n')
      .map((line) => (line.trim() ? `  ${line}` : ''))
      .join('\n');

    return dedentString(`
      try {
      ${indentedContent}
      } finally {}
    `);
  }
}
