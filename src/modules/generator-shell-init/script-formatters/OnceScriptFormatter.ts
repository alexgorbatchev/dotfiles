import path from 'node:path';
import type { ShellScript, ShellType } from '@types';
import { getScriptContent, isOnceScript } from '@types';
import { dedentString } from '@utils';
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
    return `# Generated once script - will self-delete after execution
${scriptContent}
rm "${outputPath}"`;
  }

  private generateBashScript(scriptContent: string, outputPath: string): string {
    return `# Generated once script - will self-delete after execution
${scriptContent}
rm "${outputPath}"`;
  }

  private generatePowerShellScript(scriptContent: string, outputPath: string): string {
    return `# Generated once script - will self-delete after execution
${scriptContent}
Remove-Item "${outputPath}"`;
  }
}
