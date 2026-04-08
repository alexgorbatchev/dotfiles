import type { ShellType, ToolConfig } from "@dotfiles/core";
import type { Emission } from "@dotfiles/shell-emissions";

/**
 * Additional file that needs to be written during shell generation
 */
export interface IAdditionalShellFile {
  /** Content of the file */
  content: string;
  /** Path where the file should be written */
  outputPath: string;
}

/**
 * Interface for shell-specific initialization file generators.
 * Each shell (zsh, bash, powershell) implements this interface to generate
 * shell-specific initialization files from tool configurations.
 */
export interface IShellGenerator {
  /** The shell type this generator supports */
  readonly shellType: ShellType;

  /** The file extension for this shell's initialization files */
  readonly fileExtension: string;

  /**
   * Extracts typed emissions from a tool configuration.
   * @param toolConfig - Tool configuration to process
   * @returns Array of typed emissions for the shell initialization
   */
  extractEmissions(toolConfig: ToolConfig): Emission[];

  /**
   * Checks if a tool configuration has any shell content for this shell type.
   * @param toolConfig - Tool configuration to check
   * @returns True if the tool has shell content
   */
  hasEmissions(toolConfig: ToolConfig): boolean;

  /**
   * Generates the complete shell initialization file content.
   * @param toolEmissions - Map of tool names to their emissions
   * @returns Complete shell initialization file content
   */
  generateFileContent(toolEmissions: Map<string, Emission[]>): string;

  /**
   * Gets additional files that need to be written during generation (e.g., once scripts)
   * @param toolEmissions - Map of tool names to their emissions
   * @returns Array of additional files to write
   */
  getAdditionalFiles(toolEmissions: Map<string, Emission[]>): IAdditionalShellFile[];

  /**
   * Gets the default output filename for this shell.
   * @returns Default output path for the shell initialization file
   */
  getDefaultOutputPath(): string;
}
