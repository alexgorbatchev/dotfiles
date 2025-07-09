/**
 * @file src/modules/versionChecker/index.ts
 * @description Barrel file for the version checker module.
 * This module is responsible for determining if newer versions of managed tools are available.
 *
 * ## Development Plan
 *
 * ### Stage 1: Define Interface (IVersionChecker.ts)
 * - [x] Define `VersionComparisonStatus` enum.
 * - [x] Define `IVersionChecker` interface.
 *
 * ### Stage 2: Implement Class (VersionChecker.ts)
 * - [x] Implement `VersionChecker` class.
 *
 * ### Stage 3: Create Barrel File (This file)
 * - [x] Export `IVersionChecker`, `VersionComparisonStatus`, and `VersionChecker`.
 *
 * ### Stage 4: Write Tests (VersionChecker.test.ts)
 * - [ ] Write tests for the module.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

export { VersionChecker } from './VersionChecker.ts';
export type { IVersionChecker } from './IVersionChecker.ts';
export { VersionComparisonStatus } from './IVersionChecker.ts';
