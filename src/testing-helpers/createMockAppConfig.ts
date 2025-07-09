import type { AppConfig } from '@types';
import { createAppConfig, type ConfigEnvironment, type SystemInfo } from '@modules/config';
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
