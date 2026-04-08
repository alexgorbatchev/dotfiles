import type { IOperationFailure, IOperationSuccess, ToolConfig } from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";

/**
 * Options for generating symlinks.
 */
export interface IGenerateSymlinksOptions {
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
export type SymlinkOperationStatus = "created" | "updated_target" | "backed_up" | "skipped_exists" | "skipped_correct";

/**
 * Represents the result of a single symlink operation - success case
 */
export type SymlinkOperationResultSuccess = IOperationSuccess & {
  sourcePath: string;
  targetPath: string;
  status: SymlinkOperationStatus;
};

/**
 * Represents the result of a single symlink operation - failure case
 */
export type SymlinkOperationResultFailure = IOperationFailure & {
  sourcePath: string;
  targetPath: string;
  status: "failed";
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
    options?: IGenerateSymlinksOptions,
  ): Promise<SymlinkOperationResult[]>;

  /**
   * Creates a single binary symlink with validation.
   * @param parentLogger Logger with context from calling operation (e.g., tool name).
   * @param sourcePath The absolute path to the source binary.
   * @param targetPath The absolute path where the symlink will be created.
   * @returns A promise that resolves when the symlink is created or validated.
   */
  createBinarySymlink(parentLogger: TsLogger, sourcePath: string, targetPath: string): Promise<void>;
}
