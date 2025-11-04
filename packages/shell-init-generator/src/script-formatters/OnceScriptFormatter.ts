import path from 'node:path';
import type { ShellScript, ShellType } from '@dotfiles/core';
import { getScriptContent, isOnceScript } from '@dotfiles/core';
import { dedentString, dedentTemplate } from '@dotfiles/utils';
import type { FormattedScriptOutput, IScriptFormatter } from './IScriptFormatter';

/**
 * Formatter for once scripts - generates individual executable files in .once/ directory
 * that self-delete after execution
 */
export class OnceScriptFormatter implements IScriptFormatter {
  private readonly shellScriptsDir: string;

  constructor(shellScriptsDir: string) {
    this.shellScriptsDir = shellScriptsDir;
  }

  format(script: ShellScript, toolName: string, shellType: ShellType, scriptIndex: number = 0): FormattedScriptOutput {
    if (!isOnceScript(script)) {
      throw new Error(`OnceScriptFormatter can only format OnceScript, received: ${typeof script}`);
    }

    const rawScriptContent = getScriptContent(script);
    const scriptContent = dedentString(rawScriptContent);
    const fileName = `${toolName}-${scriptIndex}.${this.getFileExtension(shellType)}`;
    const outputPath = path.join(this.shellScriptsDir, '.once', fileName);

    const formattedContent = this.generateFormattedScript(scriptContent, shellType, outputPath);

    return {
      content: formattedContent,
      requiresExecution: true,
      outputPath,
    };
  }

  private getFileExtension(shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
        return 'zsh';
      case 'bash':
        return 'bash';
      case 'powershell':
        return 'ps1';
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  private generateFormattedScript(scriptContent: string, shellType: ShellType, outputPath: string): string {
    switch (shellType) {
      case 'zsh':
        return this.generateZshScript(scriptContent, outputPath);
      case 'bash':
        return this.generateBashScript(scriptContent, outputPath);
      case 'powershell':
        return this.generatePowerShellScript(scriptContent, outputPath);
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  private generateZshScript(scriptContent: string, outputPath: string): string {
    const functionName = `__dotfiles_${path.basename(outputPath, '.zsh')}_once`;
    return dedentTemplate(
      `
      # Generated once script - will self-delete after execution
      {functionName}() {
        {scriptContent}
      }
      {functionName}
      unset -f {functionName}
      rm "{outputPath}"
    `,
      {
        functionName,
        scriptContent,
        outputPath,
      }
    );
  }

  private generateBashScript(scriptContent: string, outputPath: string): string {
    const functionName = `__dotfiles_${path.basename(outputPath, '.bash')}_once`;
    return dedentTemplate(
      `
      # Generated once script - will self-delete after execution
      {functionName}() {
        {scriptContent}
      }
      {functionName}
      unset -f {functionName}
      rm "{outputPath}"
    `,
      {
        functionName,
        scriptContent,
        outputPath,
      }
    );
  }

  private generatePowerShellScript(scriptContent: string, outputPath: string): string {
    const functionName = `__dotfiles_${path.basename(outputPath, '.ps1')}_once`;
    return dedentTemplate(
      `
      # Generated once script - will self-delete after execution
      function {functionName} {
        {scriptContent}
      }
      {functionName}
      Remove-Item Function:{functionName}
      Remove-Item "{outputPath}"
    `,
      {
        functionName,
        scriptContent,
        outputPath,
      }
    );
  }
}
