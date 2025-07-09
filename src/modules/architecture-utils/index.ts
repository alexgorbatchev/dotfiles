/**
 * @file src/modules/architecture-utils/index.ts
 * @description Barrel file for architecture-related utilities.
 *
 * This file exports the public API of the architecture-utils module.
 */

export {
  getArchitecturePatterns,
  createArchitectureRegex,
  getArchitectureRegex,
  matchesArchitecture,
} from './getArchitectureRegex';
// export * from './getSystemInfo'; // Commenting out for now as getSystemInfo.ts doesn't exist yet
