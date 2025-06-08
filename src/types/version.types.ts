/**
 * @file generator/src/types/version.types.ts
 * @description Types related to version management.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for version management.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { ToolConfig } from './toolConfig.types'; // Assuming ToolConfig will be in its own file

// ============================================
// Version Management Types
// ============================================

/**
 * Information about available updates
 */
export interface UpdateInfo {
  toolName: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string; // ISO date string
}

/**
 * Version constraint operators
 */
export type VersionConstraintOperator = '=' | '>' | '>=' | '<' | '<=' | '~' | '^';

/**
 * Version constraint specification
 */
export interface VersionConstraint {
  operator: VersionConstraintOperator;
  version: string;
}

/**
 * Interface for the version checker service
 */
export interface IVersionChecker {
  checkForUpdate(tool: ToolConfig): Promise<UpdateInfo | null>;
  checkAllForUpdates(): Promise<UpdateInfo[]>;
  parseVersionConstraint(constraint: string): VersionConstraint[];
  satisfiesConstraint(version: string, constraint: string): boolean;
}
