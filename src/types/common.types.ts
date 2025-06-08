/**
 * @file generator/src/types/common.types.ts
 * @description Common types used across the project.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define common types.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// Common Types
// ============================================

/**
 * System information for architecture detection.
 * Used as input to getArchitectureRegex for testability via DI.
 */
export interface SystemInfo {
  platform: string; // os.platform() result
  arch: string; // os.arch() result
  release?: string; // os.release() result (optional)
}

/**
 * Architecture patterns for matching GitHub release assets.
 * Contains regex patterns that match common naming conventions.
 */
export interface ArchitecturePatterns {
  system: string[]; // OS patterns like ['apple', 'darwin', 'macos']
  cpu: string[]; // Architecture patterns like ['arm64', 'aarch64']
  variants: string[]; // Additional OS-specific patterns
}

/**
 * Result of architecture detection with regex patterns.
 */
export interface ArchitectureRegex {
  systemPattern: string; // Combined regex pattern for OS matching
  cpuPattern: string; // Combined regex pattern for CPU architecture
  variantPattern: string; // Combined regex pattern for OS variants
}
