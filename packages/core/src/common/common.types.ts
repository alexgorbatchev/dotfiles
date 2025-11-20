/**
 * Represents essential system information used for architecture detection and compatibility checks.
 * This information is typically derived from the operating system's properties.
 * It is used as input, for example, to `getArchitectureRegex` for testability via Dependency Injection.
 */
export interface ISystemInfo {
  /**
   * The operating system platform identifier.
   * Corresponds to the value returned by `os.platform()` in Node.js (e.g., 'darwin', 'linux', 'win32').
   */
  platform: string;
  /**
   * The CPU architecture identifier.
   * Corresponds to the value returned by `os.arch()` in Node.js (e.g., 'x64', 'arm64').
   */
  arch: string;
  /**
   * The user's home directory path.
   * Corresponds to the value returned by `os.homedir()` in Node.js.
   * Used for expanding tilde (~) in file paths.
   */
  homeDir: string;
}
