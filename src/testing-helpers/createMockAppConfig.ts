/**
 * @file src/testing-helpers/appConfigTestHelpers.ts
 * @description Shared testing helper functions for creating AppConfig mocks.
 *
 * ## Development Plan
 *
 * ### Tasks:
 * - [x] Define `createMockAppConfig` function.
 *   - [x] Import `AppConfig`, `SystemInfo`, `ConfigEnvironment`, `createAppConfig`.
 *   - [x] Establish default `SystemInfo` and `ConfigEnvironment` for base config generation.
 *   - [x] Call `createAppConfig` to generate a base default configuration.
 *   - [x] Accept `Partial<AppConfig>` overrides.
 *   - [x] Return the merged `AppConfig` object (base + overrides).
 * - [x] Add JSDoc for the function.
 * - [x] Write tests for `createMockAppConfig` in `src/testing-helpers/__tests__/appConfigTestHelpers.test.ts`. (Tests were created then removed as per user instruction)
 * - [x] Ensure 100% test coverage. (N/A as tests were removed)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { AppConfig } from '@types';
import { createAppConfig, type ConfigEnvironment, type SystemInfo } from '@modules/config/config';
import { homedir } from 'os'; // For realistic defaults
import { cwd as processCwd } from 'process'; // For realistic defaults

/**
 * Creates a mock `AppConfig` object for testing purposes.
 *
 * It generates a base configuration using `createAppConfig` with default
 * system information and an empty environment, then applies any provided
 * overrides.
 *
 * @param overrides - Optional. A partial `AppConfig` object to override default values.
 * @returns A complete `AppConfig` object suitable for testing.
 */
export function createMockAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  const defaultSystemInfo: SystemInfo = {
    homedir: homedir() || '/home/testuser', // Use real homedir or a fallback
    cwd: processCwd() || '/home/testuser/project', // Use real cwd or a fallback
  };

  const defaultConfigEnv: ConfigEnvironment = {
    // Intentionally empty to allow createAppConfig to use all its internal defaults
    // based on the EnvSchema.
  };

  const baseConfig = createAppConfig(defaultSystemInfo, defaultConfigEnv);

  return {
    ...baseConfig,
    ...overrides,
  };
}
