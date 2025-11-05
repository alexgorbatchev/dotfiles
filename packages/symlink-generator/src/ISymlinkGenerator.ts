import type { OperationFailure, OperationSuccess, ToolConfig } from '@dotfiles/core';

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
 * Status values for symlink operation success cases
 */
export type SymlinkOperationStatus =
  | 'created'
  | 'updated_target'
  | 'backed_up'
  | 'skipped_exists'
  | 'skipped_correct'
  | 'skipped_source_missing';

/**
 * Represents the result of a single symlink operation - success case
 */
export type SymlinkOperationResultSuccess = OperationSuccess & {
  sourcePath: string;
  targetPath: string;
  status: SymlinkOperationStatus;
};

/**
 * Represents the result of a single symlink operation - failure case
 */
export type SymlinkOperationResultFailure = OperationFailure & {
  sourcePath: string;
  targetPath: string;
  status: 'failed';
};

/**
 * Represents the result of a single symlink operation
 */
export type SymlinkOperationResult = SymlinkOperationResultSuccess | SymlinkOperationResultFailure;

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
