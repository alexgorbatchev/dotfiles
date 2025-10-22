import type { ShellScript, ShellType } from '@dotfiles/schemas';

/**
 * Output from script formatter containing formatted content and metadata
 */
export interface FormattedScriptOutput {
  /** The formatted script content */
  content: string;
  /** Whether this script requires execution (for once scripts) */
  requiresExecution?: boolean;
  /** File path for the formatted output (for once scripts) */
  outputPath?: string;
}

/**
 * Interface for formatting shell scripts based on their type (once vs always)
 */
export interface IScriptFormatter {
  /**
   * Formats a shell script for inclusion in shell initialization
   *
   * @param script - The branded shell script to format
   * @param toolName - Name of the tool the script belongs to
   * @param shellType - Type of shell (zsh, bash, powershell)
   * @returns Formatted script output
   */
  format(script: ShellScript, toolName: string, shellType: ShellType): FormattedScriptOutput;
}
