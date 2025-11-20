/**
 * Represents README content with metadata
 */
export interface IReadmeContent {
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
export interface ICombinedReadmeOptions {
  /**
   * Title for the combined README
   */
  title?: string;

  /**
   * Include table of contents
   */
  includeTableOfContents?: boolean;

  /**
   * Whether to include version information
   */
  includeVersions?: boolean;
}
