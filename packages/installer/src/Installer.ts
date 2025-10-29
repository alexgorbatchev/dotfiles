import path from 'node:path';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { YamlConfig } from '@dotfiles/config';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { ICargoClient } from '@dotfiles/installer/clients/cargo';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import {
  isGitHubReleaseToolConfig,
  type BaseInstallContext,
  type BrewToolConfig,
  type CargoInstallParams,
  type CargoToolConfig,
  type CurlScriptToolConfig,
  type CurlTarToolConfig,
  type GithubReleaseInstallParams,
  type GithubReleaseToolConfig,
  type ManualToolConfig,
  type SystemInfo,
  type ToolConfig,
} from '@dotfiles/schemas';
import { generateTimestamp, resolvePlatformConfig } from '@dotfiles/utils';
import { $ } from 'bun';
import {
  installFromBrew,
  installFromCargo,
  installFromCurlScript,
  installFromCurlTar,
  installFromGitHubRelease,
  installManually,
} from './installers';
import type { IInstaller, InstallOptions, InstallResult } from './types';
import { HookExecutor, messages } from './utils';

/**
 * Orchestrates the tool installation process by coordinating services like `Downloader`,
 * `ArchiveExtractor`, and `GitHubApiClient`. It manages the entire lifecycle, including
 * directory setup, hooks, and artifact tracking.
 *
 * The installer determines the installation method from the `ToolConfig` and delegates
 * to the appropriate private method (e.g., `installFromGitHubRelease`).
 *
 * It is responsible for populating the `InstallResult` object with rich details.
 *
 * ### Public Installation Method Wrappers
 * The class exposes public methods for each installation type (e.g., `installFromGitHubRelease`,
 * `installFromBrew`) that wrap the corresponding standalone functions. These wrappers serve
 * important purposes:
 * - **Testing API**: Allow tests to focus on individual installation methods in isolation
 * - **Dependency Injection**: Properly inject all required services into standalone functions
 * - **Spying/Mocking**: Enable test spies and mocks on specific installation methods
 * - **API Consistency**: Provide uniform method signatures across all installation types
 *
 * ### GitHub Asset Selection
 * For `github-release` installations, the asset selection follows this order of precedence:
 * 1. **`assetSelector` function:** A custom function in the `ToolConfig` for complex selection logic.
 * 2. **`assetPattern` regex:** A regular expression to match against asset filenames.
 * 3. **Default Heuristics:** If the above are not provided, it attempts to find a suitable asset
 *    by matching common platform and architecture names (e.g., "darwin", "linux", "amd64")
 *    in the asset filenames.
 *
 * ### Installation Hooks
 * The installer supports several hooks defined in the `ToolConfig` to allow for
 * custom logic at various stages of the installation process:
 * - `beforeInstall`: Runs before any installation steps.
 * - `afterDownload`: Runs after the tool's asset has been downloaded.
 * - `afterExtract`: Runs after an archive has been extracted.
 * - `afterInstall`: Runs after the main installation process is complete.
 *
 * Each hook receives an `InstallHookContext` object with relevant paths and system info.
 */
export class Installer implements IInstaller {
  private readonly logger: TsLogger;
  private readonly fs: IFileSystem;
  private readonly downloader: IDownloader;
  private readonly githubApiClient: IGitHubApiClient;
  private readonly cargoClient: ICargoClient;
  private readonly archiveExtractor: IArchiveExtractor;
  private readonly appConfig: YamlConfig;
  private readonly hookExecutor: HookExecutor;
  private readonly toolInstallationRegistry: IToolInstallationRegistry;
  private readonly systemInfo: SystemInfo;

  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    downloader: IDownloader,
    githubApiClient: IGitHubApiClient,
    cargoClient: ICargoClient,
    archiveExtractor: IArchiveExtractor,
    appConfig: YamlConfig,
    toolInstallationRegistry: IToolInstallationRegistry,
    systemInfo: SystemInfo
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.fs = fileSystem;
    this.downloader = downloader;
    this.githubApiClient = githubApiClient;
    this.cargoClient = cargoClient;
    this.archiveExtractor = archiveExtractor;
    this.appConfig = appConfig;
    this.hookExecutor = new HookExecutor(parentLogger);
    this.toolInstallationRegistry = toolInstallationRegistry;
    this.systemInfo = systemInfo;
  }

  /**
   * Check if tool is already installed and return early if appropriate
   */
  private async checkExistingInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    options: InstallOptions | undefined,
    parentLogger: TsLogger
  ): Promise<InstallResult | null> {
    const logger = parentLogger.getSubLogger({ name: 'checkExistingInstallation' });
    if (options?.force) {
      return null;
    }

    const existingInstallation = await this.toolInstallationRegistry.getToolInstallation(toolName);
    if (!existingInstallation) {
      return null;
    }

    const targetVersion = await this.getTargetVersion(toolName, resolvedToolConfig);
    if (targetVersion && existingInstallation.version === targetVersion) {
      logger.debug(messages.outcome.installSuccess(toolName, targetVersion, 'already-installed'));
      return {
        success: true,
        message: `Tool ${toolName} version ${targetVersion} is already installed`,
        installPath: existingInstallation.installPath,
        version: existingInstallation.version,
        binaryPaths: existingInstallation.binaryPaths,
      };
    }

    logger.debug(messages.outcome.outdatedVersion(toolName, existingInstallation.version, targetVersion || 'unknown'));
    return null;
  }

  /**
   * Execute beforeInstall hook if defined
   */
  private async executeBeforeInstallHook(
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    toolFs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<InstallResult | null> {
    const logger = parentLogger.getSubLogger({ name: 'executeBeforeInstallHook' });
    if (!resolvedToolConfig.installParams?.hooks?.beforeInstall) {
      return null;
    }

    logger.debug(messages.lifecycle.hookExecution('beforeInstall'));
    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs);
    const result = await this.hookExecutor.executeHook(
      'beforeInstall',
      resolvedToolConfig.installParams.hooks.beforeInstall,
      enhancedContext
    );

    if (!result.success) {
      return {
        success: false,
        error: `beforeInstall hook failed: ${result.error}`,
      };
    }

    return null;
  }

  /**
   * Execute afterInstall hook if defined
   */
  private async executeAfterInstallHook(
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    result: InstallResult,
    toolFs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'executeAfterInstallHook' });
    if (!resolvedToolConfig.installParams?.hooks?.afterInstall) {
      return;
    }

    logger.debug(messages.lifecycle.hookExecution('afterInstall'));
    const finalContext = {
      ...context,
      binaryPaths: result.binaryPaths,
      version: result.version,
    };

    const enhancedContext = this.hookExecutor.createEnhancedContext(finalContext, toolFs);
    await this.hookExecutor.executeHook(
      'afterInstall',
      resolvedToolConfig.installParams.hooks.afterInstall,
      enhancedContext,
      { continueOnError: true }
    );
  }

  /**
   * Record successful installation in the registry
   */
  private async recordInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    result: InstallResult,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'recordInstallation' });
    if (!result.success || !result.binaryPaths || !result.version) {
      return;
    }

    try {
      let downloadUrl: string | undefined;
      let assetName: string | undefined;

      if (result.metadata?.method === 'github-release') {
        downloadUrl = result.metadata.downloadUrl;
        assetName = result.metadata.assetName;
      } else if (result.metadata?.method === 'cargo') {
        downloadUrl = result.metadata.downloadUrl;
      }

      await this.toolInstallationRegistry.recordToolInstallation({
        toolName,
        version: result.version,
        installPath: context.installDir,
        timestamp: context.timestamp,
        binaryPaths: result.binaryPaths,
        downloadUrl,
        assetName,
        configuredVersion: isGitHubReleaseToolConfig(resolvedToolConfig)
          ? resolvedToolConfig.installParams.version
          : undefined,
      });
      logger.debug(messages.outcome.installSuccess(toolName, result.version, 'registry-recorded'));
    } catch (error) {
      logger.error(messages.outcome.installFailed('registry-record', toolName), error);
    }
  }

  /**
   * Execute the appropriate installation method
   */
  private async executeInstallationMethod(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
    logger?: TsLogger,
    toolFs?: IFileSystem
  ): Promise<InstallResult> {
    switch (resolvedToolConfig.installationMethod) {
      case 'github-release':
        return await this.installFromGitHubRelease(toolName, resolvedToolConfig, context, options, logger, toolFs);
      case 'brew':
        return await this.installFromBrew(toolName, resolvedToolConfig, context, options);
      case 'cargo':
        return await this.installFromCargo(toolName, resolvedToolConfig, context, options);
      case 'curl-script':
        return await this.installFromCurlScript(toolName, resolvedToolConfig, context, options);
      case 'curl-tar':
        return await this.installFromCurlTar(toolName, resolvedToolConfig, context, options);
      case 'manual':
        return await this.installManually(toolName, resolvedToolConfig, context, options);
      default:
        return {
          success: false,
          error: `Unsupported installation method: ${(resolvedToolConfig as { installationMethod: string }).installationMethod}`,
        };
    }
  }

  /**
   * Install a tool based on its configuration
   */
  async install(toolName: string, toolConfig: ToolConfig, options?: InstallOptions): Promise<InstallResult> {
    // Create logger with appropriate level for shim mode
    const logger = this.logger.getSubLogger({ name: 'install' });

    logger.debug(messages.lifecycle.methodParams(toolName), toolConfig, options);

    // Resolve platform-specific configuration
    const systemInfo = this.getSystemInfo();
    const resolvedToolConfig = resolvePlatformConfig(toolConfig, systemInfo);

    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;

    // Suppress logging in TrackedFileSystem if in shim mode
    if (options?.shimMode && toolFs instanceof TrackedFileSystem) {
      toolFs.setSuppressLogging(true);
    }

    try {
      // Check if tool is already installed (unless force option is used)
      const existingResult = await this.checkExistingInstallation(toolName, resolvedToolConfig, options, logger);
      if (existingResult) {
        return existingResult;
      }

      // Create timestamped installation directory
      const binariesDir = path.join(this.appConfig.paths.generatedDir, 'binaries');
      const timestamp = generateTimestamp();
      const installDir = path.join(binariesDir, toolName, timestamp);

      await toolFs.ensureDir(installDir);
      logger.debug(messages.lifecycle.directoryCreated(installDir));

      // Create context for installation hooks
      const context = this.createBaseInstallContext(toolName, installDir, timestamp, resolvedToolConfig, logger);

      // Run beforeInstall hook if defined
      const beforeInstallResult = await this.executeBeforeInstallHook(resolvedToolConfig, context, toolFs, logger);
      if (beforeInstallResult) {
        return beforeInstallResult;
      }

      // Install based on the installation method
      const result = await this.executeInstallationMethod(
        toolName,
        resolvedToolConfig,
        context,
        options,
        logger,
        toolFs
      );

      // Run afterInstall hook if defined
      await this.executeAfterInstallHook(resolvedToolConfig, context, result, toolFs, logger);

      // Record successful installation in the registry
      await this.recordInstallation(toolName, resolvedToolConfig, context, result, logger);

      return result;
    } catch (error) {
      logger.error(messages.outcome.installFailed('install', toolName), error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a tool from GitHub releases
   */
  public async installFromGitHubRelease(
    toolName: string,
    toolConfig: GithubReleaseToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
    logger?: TsLogger,
    providedToolFs?: IFileSystem
  ): Promise<InstallResult> {
    // Use the provided filesystem or create a tool-specific one
    const toolFs = providedToolFs || (this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs);

    return installFromGitHubRelease(
      toolName,
      toolConfig,
      context,
      options,
      toolFs,
      this.downloader,
      this.githubApiClient,
      this.archiveExtractor,
      this.appConfig,
      this.hookExecutor,
      logger || this.logger
    );
  }

  /**
   * Install a tool using Homebrew
   */
  public async installFromBrew(
    toolName: string,
    toolConfig: BrewToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return installFromBrew(toolName, toolConfig, context, options, this.logger, $);
  }

  /**
   * Install a tool using Cargo pre-compiled binaries
   */
  public async installFromCargo(
    toolName: string,
    toolConfig: CargoToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return installFromCargo(
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
      this.appConfig.cargo.githubRelease.host
    );
  }

  /**
   * Install a tool using a curl script
   */
  public async installFromCurlScript(
    toolName: string,
    toolConfig: CurlScriptToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return installFromCurlScript(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.hookExecutor,
      this.logger
    );
  }

  /**
   * Install a tool from a tarball using curl
   */
  public async installFromCurlTar(
    toolName: string,
    toolConfig: CurlTarToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return installFromCurlTar(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.archiveExtractor,
      this.hookExecutor,
      this.logger
    );
  }

  /**
   * Install a tool manually
   */
  public async installManually(
    toolName: string,
    toolConfig: ManualToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return installManually(toolName, toolConfig, context, options, this.fs, this.logger);
  }

  /**
   * Get the target version that would be installed for a tool
   */
  private async getTargetVersion(toolName: string, toolConfig: ToolConfig): Promise<string | null> {
    try {
      switch (toolConfig.installationMethod) {
        case 'github-release':
          return this.getGitHubReleaseTargetVersion(toolConfig);

        case 'cargo':
          return this.getCargoTargetVersion(toolName, toolConfig);

        case 'brew':
        case 'curl-script':
        case 'curl-tar':
        case 'manual':
          // For these methods, we can't easily determine the target version
          // so we'll just return null and skip the version check
          return null;

        default:
          return null;
      }
    } catch (error) {
      this.logger.debug(
        messages.outcome.unsupportedOperation(
          'get-target-version',
          `Failed to get target version for ${toolName}: ${error}`
        )
      );
      return null;
    }
  }

  /**
   * Get target version for GitHub release installations
   */
  private async getGitHubReleaseTargetVersion(toolConfig: ToolConfig): Promise<string | null> {
    if (toolConfig.installationMethod !== 'github-release' || !toolConfig.installParams) {
      return null;
    }

    const params = toolConfig.installParams;
    if (params.version === 'latest') {
      const [owner, repo] = params.repo.split('/');
      if (!owner || !repo) {
        return null;
      }
      const release = await this.githubApiClient.getLatestRelease(owner, repo);
      return release?.tag_name || null;
    }
    return params.version || null;
  }

  /**
   * Get target version for Cargo installations
   */
  private async getCargoTargetVersion(toolName: string, toolConfig: ToolConfig): Promise<string | null> {
    if (toolConfig.installationMethod !== 'cargo') {
      return null;
    }

    if (toolConfig.version === 'latest') {
      const params = toolConfig.installParams as CargoInstallParams;
      const crateName = params?.crateName || toolName;
      const versionSource = params?.versionSource || 'cargo-toml';
      return this.getCargoVersionBySource(crateName, versionSource, toolConfig);
    }
    return toolConfig.version || null;
  }

  /**
   * Get cargo version based on version source
   */
  private async getCargoVersionBySource(
    crateName: string,
    versionSource: string,
    toolConfig: ToolConfig
  ): Promise<string | null> {
    switch (versionSource) {
      case 'cargo-toml':
        return this.getVersionFromCargoToml(crateName, toolConfig);
      case 'crates-io':
        return this.getVersionFromCratesIo(crateName);
      case 'github-releases':
        return this.getVersionFromGitHubReleases(toolConfig);
      default:
        return null;
    }
  }

  /**
   * Get version from Cargo.toml file
   */
  private async getVersionFromCargoToml(crateName: string, toolConfig: ToolConfig): Promise<string | null> {
    const params = toolConfig.installParams as CargoInstallParams;
    const cargoTomlUrl =
      params?.cargoTomlUrl ||
      this.cargoClient.buildCargoTomlUrl(params?.githubRepo || `${crateName}-community/${crateName}`);

    try {
      const packageInfo = await this.cargoClient.getCargoTomlPackage(cargoTomlUrl);
      return packageInfo?.version || null;
    } catch {
      return null;
    }
  }

  /**
   * Get version from crates.io
   */
  private async getVersionFromCratesIo(crateName: string): Promise<string | null> {
    try {
      return await this.cargoClient.getLatestVersion(crateName);
    } catch {
      return null;
    }
  }

  /**
   * Get version from GitHub releases
   */
  private async getVersionFromGitHubReleases(toolConfig: ToolConfig): Promise<string | null> {
    const params = toolConfig.installParams as CargoInstallParams;
    if (!params?.githubRepo) {
      return null;
    }
    const [owner, repo] = params.githubRepo.split('/');
    if (!owner || !repo) {
      return null;
    }
    const release = await this.githubApiClient.getLatestRelease(owner, repo);
    return release?.tag_name || null;
  }

  /**
   * Create a BaseInstallContext with all required properties from BaseToolContext
   */
  private createBaseInstallContext(
    toolName: string,
    installDir: string,
    timestamp: string,
    toolConfig: ToolConfig,
    parentLogger: TsLogger
  ): BaseInstallContext {
    const logger = parentLogger.getSubLogger({ name: 'createBaseInstallContext' });
    const getToolDir = (name: string): string => {
      return path.join(this.appConfig.paths.binariesDir, name);
    };

    return {
      toolName,
      installDir,
      timestamp,
      systemInfo: this.getSystemInfo(),
      toolConfig,
      appConfig: this.appConfig,
      // BaseToolContext properties
      toolDir: getToolDir(toolName),
      getToolDir,
      homeDir: this.appConfig.paths.homeDir,
      binDir: this.appConfig.paths.targetDir,
      shellScriptsDir: this.appConfig.paths.shellScriptsDir,
      dotfilesDir: this.appConfig.paths.dotfilesDir,
      generatedDir: this.appConfig.paths.generatedDir,
      logger: logger.getSubLogger({ name: `install-${toolName}` }),
    };
  }

  /**
   * Get system information for architecture detection
   */
  private getSystemInfo(): SystemInfo {
    return this.systemInfo;
  }
}
