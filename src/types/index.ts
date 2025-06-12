/**
 * @file src/types.ts
 * @description Project-wide shared type definitions for the dotfiles generator.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `memory-bank/techContext.md` (TypeScript Configuration Structure (Detailed Requirements) section)
 * - `.clinerules` (for file structure, naming, and content guidelines)
 * - `memory-bank/zinit-analysis-consolidated.md` (for Zinit analysis findings)
 * - `memory-bank/types-summary.md` (for new type definitions)
 *
 * ### Tasks:
 * - [x] Define `InstallHookContext` interface.
 * - [x] Define `AsyncInstallHook` type.
 * - [x] Define `BaseInstallParams` interface.
 * - [x] Define `GithubReleaseInstallParams` interface.
 * - [x] Define `BrewInstallParams` interface.
 * - [x] Define `CurlScriptInstallParams` interface.
 * - [x] Define `CurlTarInstallParams` interface.
 * - [x] Define `ManualInstallParams` interface.
 * - [x] Define `ToolConfigBuilder` interface.
 * - [x] Define `AsyncConfigureTool` type.
 * - [x] Add download system types (DownloadProgress, DownloadOptions, DownloadStrategy, IDownloader).
 * - [x] Add archive extraction types (ArchiveFormat, ExtractOptions, ExtractResult, IArchiveExtractor).
 * - [x] Add completion management types (ShellType, ShellCompletionConfig, CompletionConfig, ICompletionInstaller).
 * - [x] Add version management types (UpdateInfo, VersionConstraint, IVersionChecker).
 * - [x] Enhance GitHub API types (GitHubRateLimit, GitHubReleaseAsset, GitHubRelease, IGitHubApiClient).
 * - [x] Update existing types (InstallHookContext, ToolConfig, ManifestEntry, AppConfig, GithubReleaseInstallParams).
 * - [x] Add `githubClientUserAgent` to `AppConfig`.
 * - [x] Add JSDoc note to `AppConfig` about updating `config.ts`.
 * - [x] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .clinerules)
 * - [x] Cleanup all linting errors and warnings (after initial creation).
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Define `GeneratedArtifactsManifest` interface and update `AppConfig` with `generatedArtifactsManifestPath`.
 * - [x] Update `GeneratedArtifactsManifest` to store more detailed artifact information.
 * - [x] Add `toolConfigsDir` to `AppConfig` for tool configurations directory.
 * - [x] Add `homeDir` to `AppConfig`.
 * - [x] Add `githubHost` to `AppConfig` for configurable GitHub API host.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

export * from './appConfig.types';
export * from './archive.types';
export * from './common.types';
export * from './completion.types';
export * from './download.types';
export * from './githubApi.types';
export * from './manifest.types';
export * from './toolConfig.types';
export * from './version.types';
