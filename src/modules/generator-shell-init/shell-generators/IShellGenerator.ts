import type { CompletionConfig, ShellScript, ShellType, ToolConfig } from '@types';

/**
 * Represents shell-specific initialization content for a single tool.
 */
export interface ShellInitContent {
  /** Path to the tool configuration file that generated this content */
  configFilePath?: string;
  /** Tool-specific shell initialization code */
  toolInit: string[];
  /** PATH modifications (hoisted from tool init) */
  pathModifications: string[];
  /** Environment variable exports (hoisted from tool init) */
  environmentVariables: string[];
  /** Shell completion setup commands */
  completionSetup: string[];
  /** Scripts that run only once after tool installation/update */
  onceScripts: ShellScript[];
  /** Scripts that run every time the shell starts */
  alwaysScripts: ShellScript[];
}

/**
 * Additional file that needs to be written during shell generation
 */
export interface AdditionalShellFile {
  /** Content of the file */
  content: string;
  /** Path where the file should be written */
  outputPath: string;
  /** Whether the file should be made executable */
  executable?: boolean;
}

/**
 * Options for generating shell initialization files.
 */
export interface ShellGenerateOptions {
  /** Custom output path for the shell initialization file */
  outputPath?: string;
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
   * Extracts shell initialization content from a tool configuration.
   * @param toolName - Name of the tool
   * @param toolConfig - Tool configuration to process
   * @returns Shell-specific initialization content
   */
  extractShellContent(toolName: string, toolConfig: ToolConfig): ShellInitContent;

  /**
   * Processes completion configuration for this shell.
   * @param toolName - Name of the tool
   * @param completions - Completion configuration
   * @returns Completion setup commands for this shell
   */
  processCompletions(toolName: string, completions: CompletionConfig): string[];

  /**
   * Generates the complete shell initialization file content.
   * @param toolContents - Map of tool names to their shell content
   * @returns Complete shell initialization file content
   */
  generateFileContent(toolContents: Map<string, ShellInitContent>): string;

  /**
   * Gets additional files that need to be written during generation (e.g., once scripts)
   * @param toolContents - Map of tool names to their shell content
   * @returns Array of additional files to write
   */
  getAdditionalFiles(toolContents: Map<string, ShellInitContent>): AdditionalShellFile[];

  /**
   * Gets the default output filename for this shell.
   * @returns Default output path for the shell initialization file
   */
  getDefaultOutputPath(): string;
}
