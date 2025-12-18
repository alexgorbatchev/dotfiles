import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  UpdateCheckResult,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { stripVersionPrefix } from '@dotfiles/utils';
import type { ICargoClient } from './cargo-client';
import { installFromCargo } from './installFromCargo';
import { messages } from './log-messages';
import {
  type CargoInstallParams,
  type CargoToolConfig,
  cargoInstallParamsSchema,
  cargoToolConfigSchema,
} from './schemas';

const PLUGIN_VERSION = '1.0.0';

type CargoPluginMetadata = {
  method: 'cargo';
  crateName: string;
  binarySource: string;
  downloadUrl?: string;
};

/**
 * Installer plugin for Rust tools distributed via Cargo/crates.io.
 *
 * This plugin handles tools that are published as Rust crates and can be installed
 * using Cargo, Rust's package manager. It supports multiple installation methods:
 *
 * **Installation Sources:**
 * - **crates.io**: Official Rust package registry (default)
 * - **GitHub repository**: Install from a Git repository URL
 * - **Local path**: Install from a local directory with a Cargo.toml
 *
 * **Binary Acquisition:**
 * - Compiles from source using `cargo install`
 * - Downloads pre-built binaries from GitHub releases (when available)
 * - Extracts binaries from Cargo artifacts
 *
 * The plugin uses a Cargo client to check versions, download crates, and compile
 * binaries. It supports lifecycle hooks and can detect whether a tool needs updating
 * by comparing installed versions with the latest available on crates.io or GitHub.
 *
 * **Version Handling:**
 * - Supports semantic versioning (e.g., "^1.0.0", "~2.1.0")
 * - Can install specific versions or "latest"
 * - Tracks installed versions for update detection
 */
export class CargoInstallerPlugin
  implements IInstallerPlugin<'cargo', CargoInstallParams, CargoToolConfig, CargoPluginMetadata>
{
  readonly method = 'cargo';
  readonly displayName = 'Cargo Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = cargoInstallParamsSchema;
  readonly toolConfigSchema = cargoToolConfigSchema;

  /**
   * Creates a new CargoInstallerPlugin instance.
   *
   * @param logger - The logger instance for logging operations.
   * @param fs - The file system interface for file operations.
   * @param downloader - The downloader for fetching crates and binaries.
   * @param cargoClient - The Cargo client for interacting with crates.io and cargo commands.
   * @param archiveExtractor - The archive extractor for unpacking downloaded files.
   * @param hookExecutor - The hook executor for running lifecycle hooks.
   * @param githubHost - The GitHub hostname for API requests (e.g., 'api.github.com').
   */
  constructor(
    private readonly logger: TsLogger,
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly cargoClient: ICargoClient,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor,
    private readonly githubHost: string
  ) {}

  async install(
    toolName: string,
    toolConfig: CargoToolConfig,
    context: IInstallContext,
    options?: IInstallOptions
  ): Promise<InstallResult<CargoPluginMetadata>> {
    const result = await installFromCargo(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.cargoClient,
      this.archiveExtractor,
      this.hookExecutor,
      this.logger,
      this.githubHost
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<CargoPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };

    return installResult;
  }

  /**
   * Resolves the version of a Cargo crate before installation.
   *
   * This method queries crates.io for the latest version of the specified crate
   * and returns a normalized version string that can be used for the installation
   * directory name.
   *
   * @param toolName - Name of the tool (for logging purposes)
   * @param toolConfig - Complete tool configuration including crate name and version
   * @param _context - Installation context (not used but required by interface)
   * @param logger - Logger instance for debug output
   * @returns Normalized version string, or null if version cannot be resolved
   */
  async resolveVersion(
    toolName: string,
    toolConfig: CargoToolConfig,
    _context: IInstallContext,
    logger: TsLogger
  ): Promise<string | null> {
    const subLogger: TsLogger = logger.getSubLogger({ name: 'resolveVersion' });

    try {
      const cargoParams = toolConfig.installParams;
      const crateName: string | undefined = cargoParams?.crateName;

      if (!crateName) {
        subLogger.debug(messages.versionResolutionFailed(toolName, 'Missing crateName in install params'));
        return null;
      }

      // Query crates.io for the latest version
      const latestVersion: string | null = await this.cargoClient.getLatestVersion(crateName);

      if (!latestVersion) {
        subLogger.debug(messages.versionResolutionFailed(toolName, `Could not fetch version for crate: ${crateName}`));
        return null;
      }

      // Strip v prefix and return the version
      const normalizedVersion: string = stripVersionPrefix(latestVersion);
      subLogger.debug(messages.versionResolutionResolved(toolName, normalizedVersion));
      return normalizedVersion;
    } catch (error) {
      subLogger.debug(messages.versionResolutionException(toolName, error));
      return null;
    }
  }

  supportsUpdateCheck(): boolean {
    return true;
  }

  async checkUpdate(
    toolName: string,
    toolConfig: CargoToolConfig,
    _context: IInstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult> {
    try {
      const cargoParams = toolConfig.installParams;
      const crateName = cargoParams?.crateName;

      if (!crateName) {
        const result: UpdateCheckResult = {
          success: false,
          error: 'Missing crateName in install params',
        };
        return result;
      }

      const latestVersion = await this.cargoClient.getLatestVersion(crateName);
      if (!latestVersion) {
        const result: UpdateCheckResult = {
          success: false,
          error: `Could not fetch latest version for crate: ${crateName}`,
        };
        return result;
      }

      const configuredVersion = toolConfig.version || 'latest';

      if (configuredVersion === 'latest') {
        const result: UpdateCheckResult = {
          success: true,
          hasUpdate: false,
          currentVersion: latestVersion,
          latestVersion,
        };
        return result;
      }

      const result: UpdateCheckResult = {
        success: true,
        hasUpdate: configuredVersion !== latestVersion,
        currentVersion: configuredVersion,
        latestVersion,
      };
      return result;
    } catch (error) {
      logger.error(messages.updateCheckFailed(toolName), error);
      const result: UpdateCheckResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return result;
    }
  }

  supportsUpdate(): boolean {
    return false; // Not implemented yet
  }

  supportsReadme(): boolean {
    return false; // Could be implemented to fetch from crates.io
  }
}
