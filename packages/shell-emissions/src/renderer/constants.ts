/**
 * Section priorities for block structure.
 * These define the standard ordering of sections in the output file.
 */
export enum SectionPriority {
  /** File header with "DO NOT EDIT" warning */
  FileHeader = 0,
  /** PATH modifications - must come first so tools are available */
  Path = 100,
  /** Environment variables */
  Environment = 200,
  /** Main content with tool initializations */
  MainContent = 300,
  /** Once scripts run here (auto-inserted by renderer) */
  OnceScripts = 400,
  /** Shell completions - must come after functions are defined */
  Completions = 500,
  /** End of file marker */
  FileFooter = 999,
}

/**
 * Starting index for once script numbering.
 */
export const ONCE_SCRIPT_STARTING_INDEX = 1;

/**
 * Padding length for once script index in filenames.
 * Exported for formatter implementations to use when generating
 * once script filenames (e.g., 'once-001.zsh', 'once-002.zsh').
 */
export const ONCE_SCRIPT_INDEX_PAD_LENGTH = 3;
