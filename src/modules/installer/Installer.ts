import os from 'node:os';
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
  CurlScriptToolConfig,
  CurlTarToolConfig,
  GithubReleaseToolConfig,
  ManualToolConfig,
  SystemInfo,
  ToolConfig,
} from '@types';
import { generateTimestamp } from '@utils';
import { HookExecutor } from './HookExecutor';
import type { IInstaller, InstallOptions, InstallResult } from './IInstaller';
import { installFromBrew } from './installFromBrew';
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

  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    downloader: IDownloader,
    githubApiClient: IGitHubApiClient,
    archiveExtractor: IArchiveExtractor,
    appConfig: YamlConfig,
    toolInstallationRegistry: IToolInstallationRegistry
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.logger.debug(
      logs.command.debug.installerConstructor(),
      fileSystem.constructor.name,
      downloader.constructor.name,
      githubApiClient.constructor.name,
      archiveExtractor.constructor.name,
      appConfig
    );
    this.fs = fileSystem;
    this.downloader = downloader;
    this.githubApiClient = githubApiClient;
    this.archiveExtractor = archiveExtractor;
    this.appConfig = appConfig;
    this.hookExecutor = new HookExecutor(parentLogger);
    this.toolInstallationRegistry = toolInstallationRegistry;
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

    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    let toolFs: IFileSystem;
    if (this.fs instanceof TrackedFileSystem) {
      if (options?.shimMode) {
        // In shim mode, create TrackedFileSystem with suppressed logger
        const suppressedLogger = this.logger.getSubLogger({ name: 'TrackedFileSystem', minLevel: 4 });
        toolFs = this.fs.withToolNameAndSuppressedLogger(toolName, suppressedLogger);
      } else {
        toolFs = this.fs.withToolName(toolName);
      }
    } else {
      toolFs = this.fs;
    }

    try {
      // Check if tool is already installed (unless force option is used)
      if (!options?.force) {
        const existingInstallation = await this.toolInstallationRegistry.getToolInstallation(toolName);
        if (existingInstallation) {
          // Get the version that would be installed
          const targetVersion = await this.getTargetVersion(toolName, toolConfig);

          if (targetVersion && existingInstallation.version === targetVersion) {
            logger.debug(logs.tool.success.installed(toolName, targetVersion, 'already-installed'));
            return {
              success: true,
              message: `Tool ${toolName} version ${targetVersion} is already installed`,
              installPath: existingInstallation.installPath,
              version: existingInstallation.version,
              binaryPaths: existingInstallation.binaryPaths,
            };
          }

          logger.debug(
            logs.tool.warning.outdatedVersion(toolName, existingInstallation.version, targetVersion || 'unknown')
          );
        }
      }

      // Create timestamped installation directory
      const binariesDir = path.join(this.appConfig.paths.generatedDir, 'binaries');
      const timestamp = generateTimestamp();
      const installDir = path.join(binariesDir, toolName, timestamp);

      await toolFs.ensureDir(installDir);
      logger.debug(logs.command.debug.directoryCreated(), installDir);

      // Create context for installation hooks
      const context: BaseInstallContext = {
        toolName,
        installDir,
        timestamp,
        systemInfo: this.getSystemInfo(),
        toolConfig,
        appConfig: this.appConfig,
      };

      // Run beforeInstall hook if defined
      if (toolConfig.installParams?.hooks?.beforeInstall) {
        logger.debug(logs.command.debug.hookExecution('beforeInstall'));

        const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs, logger);

        const result = await this.hookExecutor.executeHook(
          'beforeInstall',
          toolConfig.installParams.hooks.beforeInstall,
          enhancedContext
        );

        if (!result.success) {
          return {
            success: false,
            error: `beforeInstall hook failed: ${result.error}`,
          };
        }
      }

      // Install based on the installation method
      let result: InstallResult;
      switch (toolConfig.installationMethod) {
        case 'github-release':
          result = await this.installFromGitHubRelease(toolName, toolConfig, context, options, logger);
          break;
        case 'brew':
          result = await this.installFromBrew(toolName, toolConfig, context, options);
          break;
        case 'curl-script':
          result = await this.installFromCurlScript(toolName, toolConfig, context, options);
          break;
        case 'curl-tar':
          result = await this.installFromCurlTar(toolName, toolConfig, context, options);
          break;
        case 'manual':
          result = await this.installManually(toolName, toolConfig, context, options);
          break;
        default:
          return {
            success: false,
            error: `Unsupported installation method: ${toolConfig.installationMethod}`,
          };
      }

      // Run afterInstall hook if defined
      if (toolConfig.installParams?.hooks?.afterInstall) {
        logger.debug(logs.command.debug.hookExecution('afterInstall'));

        // Update context with final result information
        const finalContext = {
          ...context,
          binaryPaths: result.binaryPaths,
          version: result.version,
        };

        const enhancedContext = this.hookExecutor.createEnhancedContext(finalContext, toolFs, logger);

        await this.hookExecutor.executeHook(
          'afterInstall',
          toolConfig.installParams.hooks.afterInstall,
          enhancedContext,
          { continueOnError: true } // Don't fail installation if afterInstall hook fails
        );
      }

      // Record successful installation in the registry
      if (result.success && result.binaryPaths && result.version) {
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
              toolConfig.installationMethod === 'github-release' ? toolConfig.installParams.version : undefined,
          });
          logger.debug(logs.tool.success.installed(toolName, result.version, 'registry-recorded'));
        } catch (registryError) {
          logger.error(logs.tool.error.installFailed('registry-record', toolName, (registryError as Error).message));
          // Don't fail the installation if registry recording fails
        }
      }

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
    logger?: TsLogger
  ): Promise<InstallResult> {
    // Use the appropriate filesystem (may be suppressed TrackedFileSystem in shim mode)
    const toolFs =
      this.fs instanceof TrackedFileSystem
        ? options?.shimMode
          ? this.fs.withToolNameAndSuppressedLogger(toolName, logger || this.logger)
          : this.fs.withToolName(toolName)
        : this.fs;

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
   * Get system information for architecture detection
   */
  private getSystemInfo(): SystemInfo {
    return {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      homeDir: os.homedir(),
    };
  }
}
