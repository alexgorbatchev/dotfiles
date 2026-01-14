import type { ShellType } from '@dotfiles/core';
import { dedentString, dedentTemplate } from '@dotfiles/utils';

/**
 * Valid shell function name pattern.
 * Must start with a letter or underscore, followed by letters, numbers, underscores, or hyphens.
 * This pattern is compatible with bash, zsh, and PowerShell naming conventions.
 */
export const VALID_FUNCTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Output from function formatter containing formatted function definition
 */
export interface IFormattedFunctionOutput {
  /** The formatted function definition */
  content: string;
}

/**
 * Formatter for shell functions - wraps function bodies in subshells (bash/zsh) or try-finally blocks (PowerShell)
 * to prevent variable pollution in the parent shell. Overrides HOME to use the configured home directory.
 */
export class FunctionScriptFormatter {
  private readonly homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
  }

  /**
   * Formats a shell function with HOME override.
   *
   * @param functionName - Name of the function
   * @param functionBody - Body of the function
   * @param shellType - Type of shell (zsh, bash, powershell)
   * @returns Formatted function output
   * @throws Error if function name is invalid
   */
  format(functionName: string, functionBody: string, shellType: ShellType): IFormattedFunctionOutput {
    this.validateFunctionName(functionName);
    const formattedContent = this.generateFormattedFunction(functionName, functionBody, shellType);

    const result: IFormattedFunctionOutput = {
      content: formattedContent,
    };

    return result;
  }

  private validateFunctionName(functionName: string): void {
    if (!functionName) {
      throw new Error('Function name cannot be empty');
    }

    if (!VALID_FUNCTION_NAME_PATTERN.test(functionName)) {
      throw new Error(
        `Invalid function name: "${functionName}". Function names must start with a letter or underscore, followed by letters, numbers, underscores, or hyphens.`,
      );
    }
  }

  private generateFormattedFunction(functionName: string, functionBody: string, shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
      case 'bash':
        return this.generateShFunction(functionName, functionBody);
      case 'powershell':
        return this.generatePowerShellFunction(functionName, functionBody);
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  private generateShFunction(functionName: string, functionBody: string): string {
    return dedentTemplate(
      `
      {functionName}() {
        (
          HOME="{homeDir}"
          {functionBody}
        )
      }
      `,
      { functionName, homeDir: this.homeDir, functionBody: dedentString(functionBody) },
    );
  }

  private generatePowerShellFunction(functionName: string, functionBody: string): string {
    return dedentTemplate(
      `
      function {functionName} {
        $homeOrig = $env:HOME
        $userProfileOrig = $env:USERPROFILE
        try {
          $env:HOME = "{homeDir}"
          $env:USERPROFILE = "{homeDir}"
          {functionBody}
        } finally {
          $env:HOME = $homeOrig
          $env:USERPROFILE = $userProfileOrig
          Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue
          Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue
        }
      }
      `,
      { functionName, homeDir: this.homeDir, functionBody: dedentString(functionBody) },
    );
  }
}
