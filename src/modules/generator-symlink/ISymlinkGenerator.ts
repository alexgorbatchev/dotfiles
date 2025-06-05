/**
 * @file generator/src/modules/generator-symlink/ISymlinkGenerator.ts
 * @description Interface for the symlink generator service.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define `GenerateSymlinksOptions` interface.
 * - [x] Define `ISymlinkGenerator` interface.
 *   - [x] Define `SymlinkOperationResult` type.
 *   - [x] Update `generate` method return type to `Promise<SymlinkOperationResult[]>`.
 * - [x] Implement `SymlinkGenerator` class (in `SymlinkGenerator.ts`).
 * - [x] Write tests for `SymlinkGenerator` (in `__tests__/SymlinkGenerator.test.ts`).
 * - [x] Create `index.ts` to export the interface and class.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { ToolConfig } from '../../types';

/**
 * Options for generating symlinks.
 */
export interface GenerateSymlinksOptions {
  /**
   * If true, log actions instead of performing them.
   * @default false
   */
  dryRun?: boolean;

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
