/**
 * @file generator/src/modules/config/config.ts
 * @description Application configuration management.
 * This module exports a pure function `createAppConfig` to generate configuration.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `.clinerules` (Functional Purity, Data Validation, DI)
 * - `memory-bank/techContext.md`
 * - `generator/src/types.ts` (for AppConfig type)
 *
 * ### Tasks:
 * - [x] Define `SystemInfo` and `ConfigEnvironment` interfaces.
 * - [x] Define `EnvSchema` using Zod for environment variable validation.
 * - [x] Implement `createAppConfig` as a pure function.
 *   - [x] It must accept `SystemInfo` and `ConfigEnvironment` as arguments.
 *   - [x] It must use `EnvSchema` to parse and validate the `ConfigEnvironment` argument.
 *   - [x] It must not call `dotenv` or access `process.env` directly.
 *   - [x] It must return a new `AppConfig` object based on inputs and defaults.
 *   - [x] Update `ConfigEnvironment` and `EnvSchema` with new properties from Zinit analysis.
 *   - [x] Add `GITHUB_CLIENT_USER_AGENT` to `ConfigEnvironment` and `EnvSchema`.
 *   - [x] (No top-level appConfig constant initialized at module load time)
 *   - [x] (Application entry point will be responsible for gathering inputs and calling createAppConfig)
 *   - [x] Implement tilde expansion for all path configurations (e.g. `DOTFILES_DIR`, `GENERATED_DIR`).
 *   - [x] Update tests for `createAppConfig`.
 *   - [x] Cleanup all linting errors and warnings.
 *   - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 *   - [x] Ensure 100% test coverage.
 *   - [x] Add `generatedArtifactsManifestPath` to `AppConfig` creation.
 *   - [x] Add `toolConfigsDir` to `AppConfig` creation, loading from `TOOL_CONFIGS_DIR` env var.
 *   - [x] Correct the default path for `toolConfigsDir` to `generator/configs/tools`.
 *   - [x] Add `homeDir` to `AppConfig` creation, sourced from `systemInfo.homedir`.
 *   - [x] Add `githubHost` to `AppConfig` creation, loading from `GITHUB_HOST` env var.
 *   - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { resolve, join } from 'path';
import { z } from 'zod';
import type { AppConfig } from '@types'; // Updated import path
export type { AppConfig }; // Re-export AppConfig

// Interface for system-specific values needed by createAppConfig
export interface SystemInfo {
  homedir: string;
  // cwd is not directly used by createAppConfig anymore for resolving .env,
  // as .env loading is externalized. It might be needed if any paths
  // in config defaults were relative to cwd, but currently they are based on homedir.
  // Keeping it for potential future use or if AppConfig needs a CWD property.
  cwd: string;
}

// Interface for the environment variables relevant to the config
// This defines the raw shape expected from the environment.
export interface ConfigEnvironment {
  /**
   * Specifies the root directory of the dotfiles repository.
   * If not set, it defaults to `~/.dotfiles`.
   * This path is used as the base for resolving other relative paths like `GENERATED_DIR` and `TOOL_CONFIG_DIR`.
   */
  DOTFILES_DIR?: string;
  /**
   * Defines the directory where all generated files (shims, manifests, caches, etc.) will be stored.
   * Defaults to `${DOTFILES_DIR}/.generated`.
   * This directory is central to the generator's output.
   */
  GENERATED_DIR?: string;
  /**
   * Sets the target directory where executable shims for tools will be placed.
   * This directory should be in the system's PATH for the shims to be globally accessible.
   * Defaults to `/usr/bin`. Requires appropriate permissions if set to a system directory.
   */
  TARGET_DIR?: string;
  /**
   * Specifies the directory containing individual TypeScript tool configuration files (e.g., `mytool.config.ts`).
   * This is the older way of defining tool configurations if still supported.
   * Defaults to `${DOTFILES_DIR}/generator/src/tools`.
   */
  TOOL_CONFIG_DIR?: string;
  /**
   * Specifies the directory containing `*.tool.ts` tool configuration files.
   * This is the primary directory scanned by `loadToolConfigs` for defining tools.
   * Defaults to `${DOTFILES_DIR}/generator/configs/tools`.
   */
  TOOL_CONFIGS_DIR?: string;
  /**
   * Controls debug logging output. Uses the `debug` module's namespace conventions.
   * Examples: `dot:*` (all logs), `dot:installTool` (specific component).
   * Defaults to an empty string (no debug logs).
   */
  DEBUG?: string;
  /**
   * Enables or disables caching for downloaded tool assets. Parsed as a boolean.
   * Set to "true" or "false". If undefined, defaults to true.
   * Affects whether the `Downloader` attempts to use or store files in `GENERATED_DIR/cache`.
   */
  CACHE_ENABLED?: string;
  /**
   * Custom prompt message to display when `sudo` is required for operations like writing to `TARGET_DIR`.
   * If not set, the system's default sudo prompt is used.
   */
  SUDO_PROMPT?: string;
  /**
   * GitHub Personal Access Token (PAT) for accessing the GitHub API.
   * Used by `GitHubApiClient` to increase rate limits and access private repositories if necessary.
   * Optional.
   */
  GITHUB_TOKEN?: string;
  /**
   * Determines if the tool should automatically check for updates on certain runs (e.g., `generate`). Parsed as a boolean.
   * Set to "true" or "false". If undefined, defaults to true.
   * Affects the behavior of the `VersionChecker` module.
   */
  CHECK_UPDATES_ON_RUN?: string;
  /**
   * Interval in seconds between automatic update checks for tools. Parsed as an integer.
   * Defaults to 86400 (24 hours).
   * Used by the `VersionChecker` module.
   */
  UPDATE_CHECK_INTERVAL?: string;
  /**
   * Timeout in milliseconds for download operations. Parsed as an integer.
   * Defaults to 300000 (5 minutes).
   * Used by the `Downloader` module.
   */
  DOWNLOAD_TIMEOUT?: string;
  /**
   * Number of retry attempts for failed downloads. Parsed as an integer.
   * Defaults to 3.
   * Used by the `Downloader` module.
   */
  DOWNLOAD_RETRY_COUNT?: string;
  /**
   * Delay in milliseconds between download retry attempts. Parsed as an integer.
   * Defaults to 1000 (1 second).
   * Used by the `Downloader` module.
   */
  DOWNLOAD_RETRY_DELAY?: string;
  /**
   * Specifies the base directory where shell completion files should be installed or linked.
   * Defaults to `${GENERATED_DIR}/completions`.
   * Used by the `CompletionInstaller` and `ShellInitGenerator`.
   */
  COMPLETIONS_DIR?: string;
  /**
   * Custom User-Agent string for requests made by the `GitHubApiClient`.
   * If not set, a default agent might be used by the client.
   */
  GITHUB_CLIENT_USER_AGENT?: string;
  /**
   * Custom GitHub API host URL. Used for all GitHub API requests and binary downloads.
   * Defaults to "https://api.github.com" if not set.
   * Useful for testing with a mock server or using GitHub Enterprise.
   */
  GITHUB_HOST?: string;
  /**
   * Enables or disables caching for GitHub API responses. Parsed as a boolean.
   * Set to "true" or "false". If undefined, defaults to true.
   * Affects whether `GitHubApiClient` uses the `IGitHubApiCache`.
   */
  GITHUB_API_CACHE_ENABLED?: string;
  /**
   * Time-to-live (TTL) in milliseconds for GitHub API cache entries. Parsed as an integer.
   * Defaults to 86400000 (24 hours).
   * Used by `FileGitHubApiCache`.
   */
  GITHUB_API_CACHE_TTL?: string;
  /**
   * Specifies the path to the manifest file that tracks all generated artifacts.
   * Defaults to `${GENERATED_DIR}/generated-manifest.json`.
   * Used by `GeneratorOrchestrator`.
   */
  GENERATED_ARTIFACTS_MANIFEST_PATH?: string;
  // GENERATOR_CLI_SHIM_NAME is not an env var, it's a constant in createAppConfig
}

// Zod schema for validating and transforming the raw environment variables
const EnvSchema = z.object({
  DOTFILES_DIR: z.string().optional(),
  GENERATED_DIR: z.string().optional(),
  TARGET_DIR: z.string().optional(),
  TOOL_CONFIG_DIR: z.string().optional(), // For individual tool *.ts files
  TOOL_CONFIGS_DIR: z.string().optional(), // For the directory containing *.tool.ts files
  DEBUG: z.string().optional(),
  CACHE_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'), // Default true if undefined or "true"
  SUDO_PROMPT: z.string().optional(),
  // New environment variables from Zinit analysis
  GITHUB_TOKEN: z.string().optional(),
  CHECK_UPDATES_ON_RUN: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? true : val.toLowerCase() === 'true')), // Default true if undefined
  UPDATE_CHECK_INTERVAL: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 86400)), // Default 24 hours in seconds
  DOWNLOAD_TIMEOUT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 300000)), // Default 5 minutes in milliseconds
  DOWNLOAD_RETRY_COUNT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 3)), // Default 3 retries
  DOWNLOAD_RETRY_DELAY: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1000)), // Default 1 second in milliseconds
  COMPLETIONS_DIR: z.string().optional(),
  GITHUB_CLIENT_USER_AGENT: z.string().optional(),
  GITHUB_HOST: z.string().optional(),
  GITHUB_API_CACHE_ENABLED: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? true : val.toLowerCase() === 'true')), // Default true
  GITHUB_API_CACHE_TTL: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return 86400000; // Default 24 hours in ms
      const num = parseInt(val, 10);
      return isNaN(num) ? 86400000 : num;
    }), // Default 24 hours in ms if invalid
  GENERATED_ARTIFACTS_MANIFEST_PATH: z.string().optional(),
  // GENERATOR_CLI_SHIM_NAME removed from schema
});

type ValidatedEnv = z.infer<typeof EnvSchema>;

/**
 * Creates a new, validated `AppConfig` object.
 *
 * This is a pure function that does not perform any I/O or access global state
 * like `process.env`. All necessary inputs must be provided via the `systemInfo`
 * and `rawEnv` arguments.
 *
 * It performs the following key operations:
 * - Validates the raw environment object (`rawEnv`) against the `EnvSchema`.
 * - Expands tilde (`~`) characters in all path-related configuration values
 *   (e.g., `DOTFILES_DIR`, `TARGET_DIR`) to absolute paths based on the
 *   provided `systemInfo.homedir`.
 * - Computes and returns a complete `AppConfig` object with all defaults applied
 *   and paths fully resolved.
 *
 * @param systemInfo - An object containing system-specific information like the home directory.
 * @param rawEnv - An object representing the raw environment variables to be used for configuration.
 * @returns A new, validated `AppConfig` object.
 */
export function createAppConfig(
  systemInfo: SystemInfo,
  rawEnv: ConfigEnvironment // Expects an object matching ConfigEnvironment shape
): AppConfig {
  // Use AppConfig here
  // 1. Validate and transform the raw environment variables using Zod
  const env: ValidatedEnv = EnvSchema.parse(rawEnv);

  // Helper function to expand tilde in paths
  const expandTilde = (filePath: string | undefined): string | undefined => {
    if (!filePath) {
      return undefined;
    }
    if (filePath === '~' || filePath.startsWith('~/')) {
      return join(systemInfo.homedir, filePath.substring(filePath.startsWith('~/') ? 2 : 1));
    }
    return filePath;
  };

  // 2. Proceed with defaults and constructing AppConfig using the validated 'env'
  // Expand tilde for all relevant paths
  const dotfilesDirRaw = expandTilde(env.DOTFILES_DIR);
  const generatedDirRaw = expandTilde(env.GENERATED_DIR);
  const targetDirRaw = expandTilde(env.TARGET_DIR);
  const toolConfigDirRaw = expandTilde(env.TOOL_CONFIG_DIR);
  const toolConfigsDirRaw = expandTilde(env.TOOL_CONFIGS_DIR);
  const completionsDirRaw = expandTilde(env.COMPLETIONS_DIR);
  const generatedArtifactsManifestPathRaw = expandTilde(env.GENERATED_ARTIFACTS_MANIFEST_PATH);

  const defaultDotfilesDir = resolve(systemInfo.homedir, '.dotfiles');
  const DOTFILES_DIR = dotfilesDirRaw || defaultDotfilesDir;
  const GENERATED_DIR = generatedDirRaw || join(DOTFILES_DIR, '.generated');
  const GENERATOR_CLI_SHIM_NAME = 'dotfiles-shim-generator'; // Define the shim name

  return {
    targetDir: targetDirRaw || '/usr/bin',
    dotfilesDir: DOTFILES_DIR,
    homeDir: systemInfo.homedir, // Added homeDir from systemInfo
    generatedDir: GENERATED_DIR,
    toolConfigDir: toolConfigDirRaw || join(DOTFILES_DIR, 'generator', 'src', 'tools'), // Existing, for individual tool files
    toolConfigsDir: toolConfigsDirRaw || join(DOTFILES_DIR, 'generator', 'configs', 'tools'), // New, for the directory of *.tool.ts files
    debug: env.DEBUG || '',
    cacheEnabled: env.CACHE_ENABLED, // This is now a boolean from Zod transform
    sudoPrompt: env.SUDO_PROMPT,

    // Derived paths
    cacheDir: join(GENERATED_DIR, 'cache'),
    binariesDir: join(GENERATED_DIR, 'binaries'),
    binDir: join(GENERATED_DIR, 'bin'),
    zshInitDir: join(GENERATED_DIR, 'zsh'),
    manifestPath: join(GENERATED_DIR, 'manifest.json'),
    completionsDir: completionsDirRaw || join(GENERATED_DIR, 'completions'),
    generatedArtifactsManifestPath:
      generatedArtifactsManifestPathRaw || join(GENERATED_DIR, 'generated-manifest.json'),

    // New configuration options from Zinit analysis
    githubToken: env.GITHUB_TOKEN,
    githubHost: env.GITHUB_HOST || 'https://api.github.com', // Default to standard GitHub API URL
    checkUpdatesOnRun: env.CHECK_UPDATES_ON_RUN,
    updateCheckInterval: env.UPDATE_CHECK_INTERVAL,
    downloadTimeout: env.DOWNLOAD_TIMEOUT,
    downloadRetryCount: env.DOWNLOAD_RETRY_COUNT,
    downloadRetryDelay: env.DOWNLOAD_RETRY_DELAY,
    githubClientUserAgent: env.GITHUB_CLIENT_USER_AGENT, // Default will be handled by GitHubApiClient if undefined
    githubApiCacheEnabled: env.GITHUB_API_CACHE_ENABLED,
    githubApiCacheTtl: env.GITHUB_API_CACHE_TTL,
    githubApiCacheDir: join(GENERATED_DIR, 'cache', 'github-api'),
    generatorCliShimName: GENERATOR_CLI_SHIM_NAME,
  };
}
