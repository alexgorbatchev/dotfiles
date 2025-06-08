/**
 * @file generator/src/types/appConfig.types.ts
 * @description Types related to application configuration.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for application configuration.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// AppConfig Types
// ============================================

/**
 * Configuration for the application, loaded from .env and CLI args.
 * @remarks
 * When adding new properties to this interface, ensure that `generator/src/modules/config/config.ts`
 * (specifically the `EnvSchema` and the `createAppConfig` function)
 * and its tests (`generator/src/modules/config/__tests__/config.test.ts`) are updated accordingly
 * to handle loading, validation, and default values for the new properties.
 */
export interface AppConfig {
  targetDir: string;
  dotfilesDir: string;
  homeDir: string; // User's home directory
  generatedDir: string;
  toolConfigDir: string; // Existing: path to tool configuration files
  toolConfigsDir: string; // New: path to tool configurations directory (plural, as per task)
  debug: string;
  cacheEnabled: boolean;
  sudoPrompt?: string;

  // Derived paths
  cacheDir: string;
  binariesDir: string; // Dir for actual binaries: .generated/binaries/
  binDir: string; // Dir for symlinks: .generated/bin/
  zshInitDir: string;
  manifestPath: string;
  completionsDir: string; // NEW: Base directory for completions
  generatedArtifactsManifestPath: string; // Path for the GeneratorOrchestrator's manifest file

  // New configuration options
  githubToken?: string; // NEW: Optional GitHub token
  githubHost?: string; // NEW: GitHub API host URL, defaults to "https://api.github.com"
  checkUpdatesOnRun?: boolean; // NEW: Check for updates automatically
  updateCheckInterval?: number; // NEW: Seconds between update checks
  downloadTimeout?: number; // NEW: Download timeout in milliseconds
  downloadRetryCount?: number; // NEW: Number of download retries
  downloadRetryDelay?: number; // NEW: Delay between retries in milliseconds
  githubClientUserAgent?: string; // NEW: Custom User-Agent for GitHub API client

  /**
   * Whether GitHub API caching is enabled
   * @default true
   */
  githubApiCacheEnabled?: boolean;

  /**
   * Time to live for GitHub API cache entries in milliseconds
   * @default 86400000 (24 hours)
   */
  githubApiCacheTtl?: number;
  githubApiCacheDir: string;
}
