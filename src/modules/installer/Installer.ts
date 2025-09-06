import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { IToolInstallationRegistry } from '@modules/tool-installation-registry';
import type {
  BaseInstallContext,
  BrewToolConfig,
  CargoToolConfig,
  CurlScriptToolConfig,
  CurlTarToolConfig,
  GithubReleaseToolConfig,
  ManualToolConfig,
  SystemInfo,
  ToolConfig,
} from '@types';
import { generateTimestamp, resolvePlatformConfig } from '@utils';
import { HookExecutor } from './HookExecutor';
import type { IInstaller, InstallOptions, InstallResult } from './IInstaller';
import { installFromBrew } from './installFromBrew';
import { installFromCargo } from './installFromCargo';
import { installFromCurlScript } from './installFromCurlScript';
import { installFromCurlTar } from './installFromCurlTar';
import { installFromGitHubRelease } from './installFromGitHubRelease';
import { installManually } from './installManually';

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
    archiveExtractor: IArchiveExtractor,
    appConfig: YamlConfig,
    toolInstallationRegistry: IToolInstallationRegistry,
    systemInfo: SystemInfo
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.logger.debug(
      logs.command.debug.installerConstructor(),
      fileSystem?.constructor?.name || 'unknown',
      downloader?.constructor?.name || 'unknown',
      githubApiClient?.constructor?.name || 'unknown',
      archiveExtractor?.constructor?.name || 'unknown',
      appConfig
    );
    this.fs = fileSystem;
    this.downloader = downloader;
    this.githubApiClient = githubApiClient;
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
    options?: InstallOptions,
    logger?: TsLogger
  ): Promise<InstallResult | null> {
    if (options?.force) {
      return null;
    }

    const existingInstallation = await this.toolInstallationRegistry.getToolInstallation(toolName);
    if (!existingInstallation) {
      return null;
    }

    const targetVersion = await this.getTargetVersion(toolName, resolvedToolConfig);
    if (targetVersion && existingInstallation.version === targetVersion) {
      logger?.debug(logs.tool.success.installed(toolName, targetVersion, 'already-installed'));
      return {
        success: true,
        message: `Tool ${toolName} version ${targetVersion} is already installed`,
        installPath: existingInstallation.installPath,
        version: existingInstallation.version,
        binaryPaths: existingInstallation.binaryPaths,
      };
    }

    logger?.debug(
      logs.tool.warning.outdatedVersion(toolName, existingInstallation.version, targetVersion || 'unknown')
    );
    return null;
  }

  /**
   * Execute beforeInstall hook if defined
   */
  private async executeBeforeInstallHook(
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    toolFs: IFileSystem,
    logger: TsLogger
  ): Promise<InstallResult | null> {
    if (!resolvedToolConfig.installParams?.hooks?.beforeInstall) {
      return null;
    }

    logger.debug(logs.command.debug.hookExecution('beforeInstall'));
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
    logger: TsLogger
  ): Promise<void> {
    if (!resolvedToolConfig.installParams?.hooks?.afterInstall) {
      return;
    }

    logger.debug(logs.command.debug.hookExecution('afterInstall'));
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
    logger: TsLogger
  ): Promise<void> {
    if (!result.success || !result.binaryPaths || !result.version) {
      return;
    }

    try {
      await this.toolInstallationRegistry.recordToolInstallation({
        toolName,
        version: result.version,
        installPath: context.installDir,
        timestamp: context.timestamp,
        binaryPaths: result.binaryPaths,
        downloadUrl: result.info?.['downloadUrl'] as string | undefined,
        assetName: result.info?.['assetName'] as string | undefined,
        configuredVersion:
          resolvedToolConfig.installationMethod === 'github-release'
            ? resolvedToolConfig.installParams.version
            : undefined,
      });
      logger.debug(logs.tool.success.installed(toolName, result.version, 'registry-recorded'));
    } catch (registryError) {
      logger.error(logs.tool.error.installFailed('registry-record', toolName, (registryError as Error).message));
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
          error: `Unsupported installation method: ${resolvedToolConfig.installationMethod}`,
        };
    }
  }

  /**
   * Install a tool based on its configuration
   */
  async install(toolName: string, toolConfig: ToolConfig, options?: InstallOptions): Promise<InstallResult> {
    // Create logger with appropriate level for shim mode
    const logger = options?.shimMode
      ? this.logger.getSubLogger({ name: 'install', minLevel: 4 }) // Suppress INFO logs in shim mode (4=error, 3=warn, 2=info)
      : this.logger.getSubLogger({ name: 'install' });

    logger.debug(logs.command.debug.methodDebugParams(), toolName, toolConfig, options);

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
      logger.debug(logs.command.debug.directoryCreated(), installDir);

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
      logger.error(logs.tool.error.installFailed('install', toolName, (error as Error).message));
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
    return installFromBrew(toolName, toolConfig, context, options, this.logger);
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
      this.archiveExtractor,
      this.hookExecutor,
      this.logger
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
          if (toolConfig.installParams.version === 'latest') {
            const [owner, repo] = toolConfig.installParams.repo.split('/');
            if (!owner || !repo) {
              return null;
            }
            const release = await this.githubApiClient.getLatestRelease(owner, repo);
            return release?.tag_name || null;
          }
          return toolConfig.installParams.version || null;

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
        logs.general.warning.unsupportedOperation(
          'get-target-version',
          `Failed to get target version for ${toolName}: ${error}`
        )
      );
      return null;
    }
  }

  /**
   * Create a BaseInstallContext with all required properties from BaseToolContext
   */
  private createBaseInstallContext(
    toolName: string,
    installDir: string,
    timestamp: string,
    toolConfig: ToolConfig,
    logger: TsLogger
  ): BaseInstallContext {
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
