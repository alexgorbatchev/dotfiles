/**
 * @file generator/src/types/common.types.ts
 * @description Common types used across the project.
 */

/**
 * Represents essential system information used for architecture detection and compatibility checks.
 * This information is typically derived from the operating system's properties.
 * It is used as input, for example, to `getArchitectureRegex` for testability via Dependency Injection.
 */
export interface SystemInfo {
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
   * The operating system release version.
   * Corresponds to the value returned by `os.release()` in Node.js (e.g., '20.3.0' for macOS Big Sur).
   * This property is optional as it may not always be required or available.
   */
  release?: string;
}

/**
 * Defines a set of string patterns used for matching system and CPU architectures,
 * often found in the names of release assets (e.g., on GitHub Releases).
 * These patterns help in identifying compatible binaries or installers for the current system.
 */
export interface ArchitecturePatterns {
  /**
   * An array of string patterns representing different ways an operating system might be named.
   * For example, for macOS, this could include `['apple', 'darwin', 'macos', 'osx']`.
   */
  system: string[];
  /**
   * An array of string patterns representing different ways a CPU architecture might be named.
   * For example, for ARM64, this could include `['arm64', 'aarch64']`.
   */
  cpu: string[];
  /**
   * An array of additional OS-specific patterns or variants that might be used in asset naming.
   * For example, `['musl']` for Linux distributions using musl libc, or `['gnu']` for glibc.
   */
  variants: string[];
}
