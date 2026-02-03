import { BaseEmissionFormatter } from './BaseEmissionFormatter';

/**
 * Base class for POSIX-compatible shell formatters (Bash, Zsh).
 * Extends BaseEmissionFormatter with POSIX-specific shared behavior.
 */
export abstract class BasePosixEmissionFormatter extends BaseEmissionFormatter {
  /**
   * Generates content for a once-script that self-deletes after execution.
   * Used by both Bash and Zsh formatters for one-time setup scripts.
   *
   * @param scriptContent - The script content to execute once
   * @param outputPath - Path to the script file (for self-deletion)
   * @param homeOverride - If true, wraps content in subshell with HOME override
   */
  protected generateOnceScriptContent(
    scriptContent: string,
    outputPath: string,
    homeOverride?: boolean,
  ): string {
    const lines = ['# Generated once script - will self-delete after execution'];

    if (homeOverride) {
      const indent = ' '.repeat(this.indentSize);
      const indentedContent = scriptContent.split('\n').map((line) => `${indent}${line}`).join('\n');
      lines.push('(');
      lines.push(`${indent}HOME="${this.homeDir}"`);
      lines.push(indentedContent);
      lines.push(')');
    } else {
      lines.push(scriptContent);
    }

    lines.push(`rm "${outputPath}"`);
    return lines.join('\n');
  }
}
