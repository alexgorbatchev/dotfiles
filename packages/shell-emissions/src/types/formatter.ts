import type { IBlock, IBlockMetadata } from "./blocks";
import type { Emission, IScriptEmission } from "./emissions";

/**
 * Configuration provided to formatters at construction.
 */
export interface IFormatterConfig {
  /** Comment line width (default: 80) */
  headerWidth?: number;
  /** Spaces per indent (default: 2) */
  indentSize?: number;
  /** Directory for once scripts (required if any timing:'once' scripts exist) */
  onceScriptDir?: string;
}

/**
 * Content generated for a once script.
 */
export interface IOnceScriptContent {
  /** Script content including self-delete command */
  content: string;
  /** Generated filename for this script */
  filename: string;
}

/**
 * Interface that consumers implement to convert emissions to shell syntax.
 */
export interface IEmissionFormatter {
  /** File extension (e.g., '.zsh', '.bash', '.ps1') */
  readonly fileExtension: string;

  /**
   * Renders an emission to shell-specific syntax.
   */
  formatEmission(emission: Emission): string;

  /**
   * Renders a once script with self-delete logic.
   */
  formatOnceScript(emission: IScriptEmission, index: number): IOnceScriptContent;

  /**
   * Generates the loop that executes pending once scripts.
   */
  formatOnceScriptInitializer(): string;

  /**
   * Generates the file header ("DO NOT EDIT" warning).
   */
  formatFileHeader(metadata?: IBlockMetadata): string;

  /**
   * Generates a major section divider.
   */
  formatSectionHeader(title: string): string;

  /**
   * Generates a child block header within a section.
   */
  formatChildBlockHeader(block: IBlock): string;

  /**
   * Generates the end of file marker.
   */
  formatFileFooter(): string;

  /**
   * Creates a single-line comment.
   */
  comment(text: string): string;

  /**
   * Creates a multi-line comment block.
   */
  commentBlock(lines: string[]): string;
}

/**
 * A once script to be written as a separate file.
 */
export interface IOnceScript {
  /** Generated filename (e.g., 'my-config-001.zsh') */
  filename: string;
  /** Script content including self-delete */
  content: string;
  /** Constant - once scripts must be executable */
  executable: true;
}

/**
 * Output from the renderer.
 */
export interface IRenderedOutput {
  /** The rendered shell content */
  content: string;
  /** From formatter (e.g., '.zsh') */
  fileExtension: string;
  /** Separate files to write (empty array if none) */
  onceScripts: IOnceScript[];
}

/**
 * Interface for the block renderer.
 */
export interface IBlockRenderer {
  /**
   * Renders blocks using the provided formatter.
   */
  render(blocks: IBlock[], formatter: IEmissionFormatter): IRenderedOutput;
}
