import { BaseEmissionFormatter } from "./BaseEmissionFormatter";

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
   */
  protected generateOnceScriptContent(scriptContent: string, outputPath: string, sourceAttribution?: string): string {
    const lines = ["# Generated once script - will self-delete after execution"];
    if (sourceAttribution) {
      lines.push(this.comment(sourceAttribution));
    }
    lines.push(scriptContent);
    lines.push(`rm "${outputPath}"`);
    return lines.join("\n");
  }
}
