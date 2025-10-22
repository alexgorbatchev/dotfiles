import type { ShellScript, ShellType } from '@dotfiles/schemas';
import { getScriptContent, isAlwaysScript } from '@dotfiles/schemas';
import { dedentString } from '@dotfiles/utils';
import type { FormattedScriptOutput, IScriptFormatter } from './IScriptFormatter';

/**
 * Formatter for always scripts - wraps them in self-executing functions
 * that are automatically unset to prevent variable pollution
 */
export class AlwaysScriptFormatter implements IScriptFormatter {
  format(script: ShellScript, toolName: string, shellType: ShellType): FormattedScriptOutput {
    if (!isAlwaysScript(script)) {
      throw new Error(`AlwaysScriptFormatter can only format AlwaysScript, received: ${typeof script}`);
    }

    const scriptContent = getScriptContent(script);
    const functionName = `__dotfiles_${toolName}_always`;

    const formattedContent = this.generateFormattedScript(scriptContent, functionName, shellType);

    return {
      content: formattedContent,
      requiresExecution: false, // Always scripts are executed inline
    };
  }

  private generateFormattedScript(scriptContent: string, functionName: string, shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
      case 'bash':
        return this.generateShScript(scriptContent, functionName);
      case 'powershell':
        return this.generatePowerShellScript(scriptContent, functionName);
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  private generateShScript(scriptContent: string, functionName: string): string {
    // Indent the script content for proper function formatting
    const indentedContent = scriptContent
      .split('\n')
      .map((line) => (line.trim() ? `  ${line}` : line))
      .join('\n');

    return dedentString(`
      ${functionName}() {
      ${indentedContent}
      }
      ${functionName}
      unset -f ${functionName}
    `);
  }

  private generatePowerShellScript(scriptContent: string, functionName: string): string {
    // Indent the script content for proper function formatting
    const indentedContent = scriptContent
      .split('\n')
      .map((line) => (line.trim() ? `  ${line}` : line))
      .join('\n');

    return dedentString(`
      function ${functionName} {
      ${indentedContent}
      }
      ${functionName}
      Remove-Item Function:${functionName}
    `);
  }
}
