/**
 * @file generator/src/types/completion.types.ts
 * @description Types related to shell completion management.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for completion management.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// Completion Management Types
// ============================================

/**
 * Shell type for completions
 */
export type ShellType = 'zsh' | 'bash' | 'fish';

/**
 * Configuration for a single shell's completions
 */
export interface ShellCompletionConfig {
  source: string; // Path within the extracted archive
  name?: string; // Custom completion name (defaults to _toolName)
  targetDir?: string; // Custom target directory
}

/**
 * Completion configuration for a tool
 */
export interface CompletionConfig {
  zsh?: ShellCompletionConfig;
  bash?: ShellCompletionConfig;
  fish?: ShellCompletionConfig;
}

/**
 * Interface for the completion installer service
 */
export interface ICompletionInstaller {
  installCompletions(
    toolName: string,
    extractedDir: string,
    config: CompletionConfig
  ): Promise<void>;

  getInstalledCompletions(toolName: string): Promise<Record<ShellType, string | undefined>>;
  removeCompletions(toolName: string): Promise<void>;
}
