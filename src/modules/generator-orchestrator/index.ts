/**
 * @file generator/src/modules/generator-orchestrator/index.ts
 * @description Barrel file for the GeneratorOrchestrator module.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Export `IGeneratorOrchestrator` and `GenerateAllOptions` from `./IGeneratorOrchestrator`.
 * - [x] Export `GeneratorOrchestrator` from `./GeneratorOrchestrator`.
 * - [x] (No dedicated tests needed for this file as it only contains exports - correctness verified by TSC and consuming code's tests)
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

export * from './IGeneratorOrchestrator';
export * from './GeneratorOrchestrator';
// GeneratedArtifactsManifest is already exported from generator/src/types.ts
// and re-exporting it here might cause confusion or circular dependency issues
// if not handled carefully. It's better to import it directly from types.ts.
