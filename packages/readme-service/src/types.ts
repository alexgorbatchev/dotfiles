/**
 * Represents README content with metadata
 */
export interface ReadmeContent {
  /**
   * The raw markdown content of the README
   */
  content: string;

  /**
   * The tool name
   */
  toolName: string;

  /**
   * The repository owner
   */
  owner: string;

  /**
   * The repository name
   */
  repo: string;

  /**
   * The version/tag this README corresponds to
   */
  version: string;

  /**
   * URL where the README was fetched from
   */
  sourceUrl: string;

  /**
   * Timestamp when README was fetched
   */
  fetchedAt: number;
}

/**
 * Options for generating combined README
 */
export interface CombinedReadmeOptions {
  /**
   * Title for the combined README
   */
  title?: string;

  /**
   * Include table of contents
   */
  includeTableOfContents?: boolean;

  /**
   * Maximum length of tool descriptions (0 = no limit)
   */
  maxDescriptionLength?: number;

  /**
   * Whether to include version information
   */
  includeVersions?: boolean;
}

/**
 * Installed tool information from registry
 */
export interface InstalledTool {
  /**
   * Tool name
   */
  name: string;

  /**
   * Tool version
   */
  version: string;

  /**
   * Installation method
   */
  installMethod: string;

  /**
   * Repository owner (for GitHub tools)
   */
  owner?: string;

  /**
   * Repository name (for GitHub tools)
   */
  repo?: string;
}
