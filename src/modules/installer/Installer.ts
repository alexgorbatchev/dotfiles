import path from 'node:path';
import os from 'node:os';
import type { TsLogger } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import type { YamlConfig } from '@modules/config';
import { TrackedFileSystem } from '@modules/file-registry';
import type {
  ToolConfig,
  SystemInfo,
  BrewToolConfig,
  CurlTarToolConfig,
  ManualToolConfig,
  GithubReleaseToolConfig,
  CurlScriptToolConfig,
  BaseInstallContext,
} from '@types';
import type { IInstaller, InstallOptions, InstallResult } from './IInstaller';
import { ErrorTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';
import { HookExecutor } from './HookExecutor';
import { installFromGitHubRelease } from './installFromGitHubRelease';
import { installFromBrew } from './installFromBrew';
import { installFromCurlScript } from './installFromCurlScript';
import { installFromCurlTar } from './installFromCurlTar';
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

  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    downloader: IDownloader,
    githubApiClient: IGitHubApiClient,
    archiveExtractor: IArchiveExtractor,
    appConfig: YamlConfig,
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.logger.debug(
      DebugTemplates.command.installerConstructor(),
      fileSystem.constructor.name,
      downloader.constructor.name,
      githubApiClient.constructor.name,
      archiveExtractor.constructor.name,
      appConfig,
    );
    this.fs = fileSystem;
    this.downloader = downloader;
    this.githubApiClient = githubApiClient;
    this.archiveExtractor = archiveExtractor;
    this.appConfig = appConfig;
    this.hookExecutor = new HookExecutor(parentLogger);
  }

  /**
   * Install a tool based on its configuration
   */
  async install(
    toolName: string,
    toolConfig: ToolConfig,
    options?: InstallOptions,
  ): Promise<InstallResult> {
    const logger = this.logger.getSubLogger({ name: 'install' });
    logger.debug(DebugTemplates.command.methodDebugParams(), toolName, toolConfig, options);
    
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem 
      ? this.fs.withToolName(toolName)
      : this.fs;
    
    try {
      // Create installation directory if it doesn't exist
      const binariesDir = path.join(this.appConfig.paths.generatedDir, 'binaries');
      const versionDir = toolConfig.version || 'unknown';
      const installDir = path.join(binariesDir, toolName, versionDir);
      await toolFs.ensureDir(installDir);
      logger.debug(DebugTemplates.command.directoryCreated(), installDir);

      // Create context for installation hooks
      const context: BaseInstallContext = {
        toolName,
        installDir,
        systemInfo: this.getSystemInfo(),
        toolConfig,
        appConfig: this.appConfig,
      };

      // Run beforeInstall hook if defined
      if (toolConfig.installParams?.hooks?.beforeInstall) {
        logger.debug(DebugTemplates.command.hookExecution('beforeInstall'));
        
        const enhancedContext = this.hookExecutor.createEnhancedContext(
          context, toolFs, logger
        );
        
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
          result = await this.installFromGitHubRelease(toolName, toolConfig, context, options);
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
        logger.debug(DebugTemplates.command.hookExecution('afterInstall'));
        
        // Update context with final result information
        const finalContext = {
          ...context,
          binaryPath: result.binaryPath,
          version: result.version,
        };
        
        const enhancedContext = this.hookExecutor.createEnhancedContext(
          finalContext, toolFs, logger
        );
        
        await this.hookExecutor.executeHook(
          'afterInstall',
          toolConfig.installParams.hooks.afterInstall,
          enhancedContext,
          { continueOnError: true } // Don't fail installation if afterInstall hook fails
        );
        
      }


      return result;
    } catch (error) {
      logger.error(ErrorTemplates.tool.installFailed('install', toolName, (error as Error).message));
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
  ): Promise<InstallResult> {
    return installFromGitHubRelease(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.githubApiClient,
      this.archiveExtractor,
      this.appConfig,
      this.hookExecutor,
      this.logger,
    );
  }

  /**
   * Install a tool using Homebrew
   */
  public async installFromBrew(
    toolName: string,
    toolConfig: BrewToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
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
    options?: InstallOptions,
  ): Promise<InstallResult> {
    return installFromCurlScript(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.hookExecutor,
      this.logger,
    );
  }

  /**
   * Install a tool from a tarball using curl
   */
  public async installFromCurlTar(
    toolName: string,
    toolConfig: CurlTarToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
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
      this.logger,
    );
  }

  /**
   * Install a tool manually
   */
  public async installManually(
    toolName: string,
    toolConfig: ManualToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
  ): Promise<InstallResult> {
    return installManually(toolName, toolConfig, context, options, this.fs, this.logger);
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
