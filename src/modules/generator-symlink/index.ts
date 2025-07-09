/**
 * @file src/modules/generator-symlink/index.ts
 * @description Barrel file for the symlink generator module.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define `GenerateSymlinksOptions` interface (in `ISymlinkGenerator.ts`).
 * - [x] Define `ISymlinkGenerator` interface (in `ISymlinkGenerator.ts`).
 * - [x] Implement `SymlinkGenerator` class (in `SymlinkGenerator.ts`).
 * - [x] Write tests for `SymlinkGenerator` (in `__tests__/SymlinkGenerator.test.ts`).
 * - [x] Create `index.ts` to export the interface and class.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

export * from './ISymlinkGenerator';
export * from './SymlinkGenerator';
