import type { IOperationFailure, IOperationSuccess, ToolConfig } from "@dotfiles/core";

/**
 * Options for generating copies.
 */
export interface IGenerateCopiesOptions {
  /**
   * If true, overwrite existing files at the target location.
   * @default false
   */
  overwrite?: boolean;

  /**
   * If true, back up existing files at the target location before overwriting.
   * Ignored if `overwrite` is false.
   * @default false
   */
  backup?: boolean;
}

/**
 * Status values for copy operation success cases
 */
export type CopyOperationStatus = "created" | "updated_target" | "backed_up" | "skipped_exists";

/**
 * Represents the result of a single copy operation - success case
 */
export type CopyOperationResultSuccess = IOperationSuccess & {
  sourcePath: string;
  targetPath: string;
  status: CopyOperationStatus;
};

/**
 * Represents the result of a single copy operation - failure case
 */
export type CopyOperationResultFailure = IOperationFailure & {
  sourcePath: string;
  targetPath: string;
  status: "failed";
};

/**
 * Represents the result of a single copy operation
 */
export type CopyOperationResult = CopyOperationResultSuccess | CopyOperationResultFailure;

/**
 * Interface for a service that copies files for dotfiles.
 */
export interface ICopyGenerator {
  /**
   * Copies files based on the provided tool configurations.
   * @param toolConfigs A record of tool configurations, where keys are tool names.
   * @param options Options for generating copies.
   * @returns A promise that resolves with an array of results for each attempted copy.
   */
  generate(toolConfigs: Record<string, ToolConfig>, options?: IGenerateCopiesOptions): Promise<CopyOperationResult[]>;
}
