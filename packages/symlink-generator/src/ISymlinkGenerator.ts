import type { ToolConfig } from '@dotfiles/schemas';

/**
 * Options for generating symlinks.
 */
export interface GenerateSymlinksOptions {
  /**
   * If true, overwrite existing files/symlinks at the target location.
   * @default false
   */
  overwrite?: boolean;

  /**
   * If true, back up existing files/symlinks at the target location before overwriting.
   * Ignored if `overwrite` is false.
   * @default false
   */
  backup?: boolean;
}

/**
 * Represents the result of a single symlink operation.
 */
export type SymlinkOperationResult = {
  sourcePath: string;
  targetPath: string;
  status:
    | 'created'
    | 'updated_target'
    | 'backed_up'
    | 'skipped_exists'
    | 'skipped_correct'
    | 'skipped_source_missing'
    | 'failed';
  error?: string;
};

/**
 * Interface for a service that generates symbolic links for dotfiles.
 */
export interface ISymlinkGenerator {
  /**
   * Generates symbolic links based on the provided tool configurations.
   * @param toolConfigs A record of tool configurations, where keys are tool names.
   * @param options Options for generating symlinks.
   * @returns A promise that resolves with an array of results for each attempted symlink.
   */
  generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateSymlinksOptions
  ): Promise<SymlinkOperationResult[]>;
}
