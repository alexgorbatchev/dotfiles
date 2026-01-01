import path from 'node:path';
import type { ShellScript, ShellType } from '@dotfiles/core';
import { getScriptContent, isOnceScript } from '@dotfiles/core';
import { dedentString, dedentTemplate } from '@dotfiles/utils';
import type { IFormattedScriptOutput, IScriptFormatter } from './IScriptFormatter';

/**
 * Formatter for once scripts - generates individual executable files in .once/ directory
 * that self-delete after execution. Uses subshells (bash/zsh) or try-finally blocks (PowerShell)
 * to prevent variable pollution in the parent shell. Overrides HOME to use the configured home directory.
 */
export class OnceScriptFormatter implements IScriptFormatter {
  private readonly shellScriptsDir: string;
  private readonly homeDir: string;

  constructor(shellScriptsDir: string, homeDir: string) {
    this.shellScriptsDir = shellScriptsDir;
    this.homeDir = homeDir;
  }

  format(script: ShellScript, toolName: string, shellType: ShellType, scriptIndex: number = 0): IFormattedScriptOutput {
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
    return dedentTemplate(
      `
      # Generated once script - will self-delete after execution
      (
        HOME="{homeDir}"
        {scriptContent}
      )
      rm "{outputPath}"
    `,
      {
        homeDir: this.homeDir,
        scriptContent,
        outputPath,
      }
    );
  }

  private generateBashScript(scriptContent: string, outputPath: string): string {
    return dedentTemplate(
      `
      # Generated once script - will self-delete after execution
      (
        HOME="{homeDir}"
        {scriptContent}
      )
      rm "{outputPath}"
    `,
      {
        homeDir: this.homeDir,
        scriptContent,
        outputPath,
      }
    );
  }

  private generatePowerShellScript(scriptContent: string, outputPath: string): string {
    return dedentTemplate(
      `
      # Generated once script - will self-delete after execution
      $homeOrig = $env:HOME
      $userProfileOrig = $env:USERPROFILE
      try {
        $env:HOME = "{homeDir}"
        $env:USERPROFILE = "{homeDir}"
        {scriptContent}
      } finally {
        $env:HOME = $homeOrig
        $env:USERPROFILE = $userProfileOrig
        Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue
        Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue
      }
      Remove-Item "{outputPath}"
    `,
      {
        homeDir: this.homeDir,
        scriptContent,
        outputPath,
      }
    );
  }
}
