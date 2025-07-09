/**
 * @file src/modules/generator-shell-init/index.ts
 * @description Barrel file for the shell initialization generator module.
 *
 * ## Development Plan (for index.ts)
 *
 * ### Tasks:
 * - [x] Export `IShellInitGenerator`, `GenerateShellInitOptions`, and `IShellInitGeneratorConstructor` from `./IShellInitGenerator`.
 * - [x] Export `ShellInitGenerator` from `./ShellInitGenerator`.
 * - [x] (No dedicated tests needed for this file as it only exports - correctness verified by TSC and consuming code's tests)
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete (part of the overall module task).
 */

export * from './IShellInitGenerator';
export * from './ShellInitGenerator';
