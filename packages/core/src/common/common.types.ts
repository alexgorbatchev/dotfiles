import type { Architecture, Platform } from './platform.types';

/**
 * Represents essential system information used for architecture detection and compatibility checks.
 * This information is typically derived from the operating system's properties.
 * It is used as input, for example, to `getArchitectureRegex` for testability via Dependency Injection.
 */
export interface ISystemInfo {
  /**
   * The operating system platform.
   */
  platform: Platform;
  /**
   * The CPU architecture.
   */
  arch: Architecture;
  /**
   * The user's home directory path.
   * Corresponds to the value returned by `os.homedir()` in Node.js.
   * Used for expanding tilde (~) in file paths.
   */
  homeDir: string;
}
