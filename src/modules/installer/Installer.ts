import path from 'node:path';
import os from 'node:os';
import type { TsLogger } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import type { YamlConfig } from '@modules/config';
import { expandToolConfigPath } from '@utils';
import { TrackedFileSystem } from '@modules/file-registry';
import type {
  ToolConfig,
  GitHubReleaseAsset,
  SystemInfo,
  ExtractResult,
  BrewToolConfig,
  CurlTarToolConfig,
  ManualToolConfig,
  GithubReleaseToolConfig,
  CurlScriptToolConfig,
  BaseInstallContext,
  PostDownloadInstallContext,
  PostExtractInstallContext,
} from '@types';
import type { IInstaller, InstallOptions, InstallResult } from './IInstaller';
import { ErrorTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';
import { ProgressBar, shouldShowProgress } from '@modules/downloader/ProgressBar';
import { HookExecutor } from './HookExecutor';


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
    _options?: InstallOptions,
  ): Promise<InstallResult> {
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem 
      ? this.fs.withToolName(toolName)
      : this.fs;

    const logger = this.logger.getSubLogger({ name: 'installFromGitHubRelease' });
    logger.debug(DebugTemplates.command.methodStarted(), toolName);

    // Context variables for lifecycle stages
    let postDownloadContext: PostDownloadInstallContext;
    let postExtractContext: PostExtractInstallContext | undefined;

    if (!toolConfig.installParams || !('repo' in toolConfig.installParams)) {
      return {
        success: false,
        error: 'GitHub repository not specified in installParams',
      };
    }

    const params = toolConfig.installParams;
    const repo = params.repo;
    const version = params.version || 'latest';
    const assetPattern = params.assetPattern;

    try {
      // Get the release from GitHub
      let release;
      if (version === 'latest') {
        logger.debug(DebugTemplates.command.gitHubReleaseLatest(), repo || toolName);
        const [owner, repoName] = (repo || '').split('/');
        if (!owner || !repoName) {
          return {
            success: false,
            error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
          };
        }
        release = await this.githubApiClient.getLatestRelease(owner, repoName);
      } else {
        logger.debug(
          DebugTemplates.command.gitHubReleaseDetails(),
          version,
          repo || toolName,
        );
        const [owner, repoName] = (repo || '').split('/');
        if (!owner || !repoName) {
          return {
            success: false,
            error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
          };
        }
        release = await this.githubApiClient.getReleaseByTag(owner, repoName, version);
      }

      if (!release) {
        return {
          success: false,
          error: `Failed to fetch release information for ${repo || toolName}`,
          };
      }

      // Select the appropriate asset
      let asset: GitHubReleaseAsset | undefined;
      if (params.assetSelector) {
        logger.debug(DebugTemplates.command.assetSelectorCustom());
        asset = params.assetSelector(release.assets, context.systemInfo);
      } else if (assetPattern) {
        logger.debug(DebugTemplates.command.assetPatternMatch(), assetPattern);
        const regex = new RegExp(assetPattern || '');
        asset = release.assets.find((a) => regex.test(a.name));
      } else {
        // Try to find an asset that matches the current platform and architecture
        logger.debug(DebugTemplates.command.assetPlatformMatch());
        const platform = context.systemInfo.platform.toLowerCase();
        const arch = context.systemInfo.arch.toLowerCase();

        // Common platform/arch naming patterns in GitHub releases
        const platformPatterns =
          platform === 'darwin'
            ? ['darwin', 'macos', 'mac', 'osx']
            : platform === 'win32'
              ? ['windows', 'win']
              : ['linux'];

        const archPatterns =
          arch === 'x64'
            ? ['x64', 'amd64', 'x86_64']
            : arch === 'arm64'
              ? ['arm64', 'aarch64']
              : [arch];

        asset = release.assets.find((a) => {
          const name = a.name.toLowerCase();
          return (
            platformPatterns.some((p) => name.includes(p)) &&
            archPatterns.some((archPattern) => name.includes(archPattern))
          );
        });
      }

      if (!asset) {
        const availableAssetNames = release.assets.map((a) => a.name);
        let searchedForMessage = '';
        if (params.assetSelector) {
          searchedForMessage = 'using a custom assetSelector function.';
        } else if (assetPattern) {
          searchedForMessage = `for asset pattern: "${assetPattern}".`;
        } else {
          const platform = context.systemInfo.platform.toLowerCase();
          const arch = context.systemInfo.arch.toLowerCase();
          searchedForMessage = `for platform "${platform}" and architecture "${arch}".`;
        }

        const errorLines = [
          `No suitable asset found in release "${release.tag_name}" ${searchedForMessage}`,
          `Available assets in release "${release.tag_name}":`,
          ...availableAssetNames.map((name) => `  - ${name}`),
        ];
        return {
          success: false,
          error: errorLines.join('\n'),
          };
      }

      // Download the asset
      let downloadUrl: string;
      const rawBrowserDownloadUrl = asset.browser_download_url;
      const customHost = this.appConfig.github.host;

      logger.debug(
        DebugTemplates.command.determiningDownloadUrl(),
        rawBrowserDownloadUrl,
        customHost,
      );

      try {
        // Check if rawBrowserDownloadUrl is an absolute URL
        let isAbsolute = false;
        try {
          // tslint:disable-next-line:no-unused-expression
          new URL(rawBrowserDownloadUrl);
          isAbsolute = true;
        } catch (_) {
          // Not an absolute URL, so it's relative or invalid
          isAbsolute = false;
        }

        if (isAbsolute) {
          // If it's an absolute URL, use it directly.
          // GitHub asset URLs (browser_download_url) are typically direct download links
          // and should not be rewritten with appConfig.githubHost if they are already absolute.
          // The issue arises when appConfig.githubHost (e.g., api.github.com) is used to replace
          // the host of a perfectly valid github.com download URL.
          downloadUrl = rawBrowserDownloadUrl;
          logger.debug(
            DebugTemplates.command.usingAbsoluteUrl(),
            downloadUrl,
          );
        } else if (rawBrowserDownloadUrl.startsWith('/')) {
          // Case: rawBrowserDownloadUrl is a relative path (e.g., "/owner/repo/releases/download/v1.0.0/asset.tar.gz")
          // Resolve it against the customHost or the default GitHub host for assets.
          // Assets are typically on "github.com", not "api.github.com".
          let base =
            customHost && !customHost.includes('api.github.com')
              ? customHost
              : 'https://github.com';
          if (!/^https?:\/\//.test(base)) {
            base = `https:${base.startsWith('//') ? '' : '//'}${base}`;
          }
          const finalUrl = new URL(rawBrowserDownloadUrl, base);
          downloadUrl = finalUrl.toString();
          logger.debug(
            DebugTemplates.command.resolvedRelativeUrl(),
            base,
            rawBrowserDownloadUrl,
            downloadUrl,
          );
        } else {
          // Invalid or unsupported URL format
          logger.debug(
            DebugTemplates.command.invalidUrlFormat(),
            rawBrowserDownloadUrl,
          );
          return {
            success: false,
            error: `Invalid asset download URL format: ${rawBrowserDownloadUrl}`,
          };
        }

        logger.debug(
          DebugTemplates.command.finalDownloadUrl(),
          rawBrowserDownloadUrl,
          customHost || '(public GitHub)',
          downloadUrl,
        );
      } catch (e) {
        logger.error(ErrorTemplates.service.network.invalidUrl(rawBrowserDownloadUrl));
        logger.debug(DebugTemplates.command.downloadUrlError(),
          rawBrowserDownloadUrl,
          customHost || '(public GitHub)',
          (e as Error).message,
        );
        return {
          success: false,
          error: `Failed to construct valid download URL. Raw: ${rawBrowserDownloadUrl}, Configured Host: ${customHost || '(public GitHub)'}, Error: ${(e as Error).message}`,
          };
      }

      logger.debug(DebugTemplates.command.downloadingAsset(), downloadUrl);
      const downloadPath = path.join(context.installDir, asset.name);
      
      const showProgress = shouldShowProgress(_options?.quiet);
      const progressBar = new ProgressBar(asset.name, { enabled: showProgress });
      
      try {
        await this.downloader.download(downloadUrl, {
          destinationPath: downloadPath,
          onProgress: progressBar.createCallback(),
        });
      } finally {
        progressBar.finish();
      }

      // Update context with download path
      postDownloadContext = {
        ...context,
        downloadPath,
      };

      // Run afterDownload hook if defined
      if (toolConfig.installParams?.hooks?.afterDownload) {
        logger.debug(DebugTemplates.installer.runningAfterDownloadHook());
        
        const enhancedContext = this.hookExecutor.createEnhancedContext(
          postDownloadContext, this.fs, logger
        );
        
        const hookResult = await this.hookExecutor.executeHook(
          'afterDownload',
          toolConfig.installParams.hooks.afterDownload,
          enhancedContext
        );
        
        if (!hookResult.success) {
          return {
            success: false,
            error: `afterDownload hook failed: ${hookResult.error}`,
          };
        }
        
      }

      // Handle extraction if needed
      const isArchive = asset.name.endsWith('.tar.gz') ||
                        asset.name.endsWith('.tgz') ||
                        asset.name.endsWith('.zip') ||
                        asset.name.endsWith('.tar');
      
      if (isArchive) {
        logger.debug(DebugTemplates.installer.extractingArchive(), asset.name);

        // Extract the archive to a temporary directory
        const tempExtractDir = path.join(context.installDir, 'temp-extract');
        await toolFs.ensureDir(tempExtractDir);

        const extractResult: ExtractResult = await this.archiveExtractor.extract(downloadPath, {
          targetDir: tempExtractDir,
          stripComponents: params.stripComponents, // from GithubReleaseInstallParams
        });
        logger.debug(DebugTemplates.installer.archiveExtracted(), extractResult);

        // Update context with extract directory and result
        postExtractContext = {
          ...postDownloadContext,
          extractDir: tempExtractDir,
          extractResult,
        };

        // Run afterExtract hook if defined
        if (toolConfig.installParams?.hooks?.afterExtract) {
          logger.debug(DebugTemplates.installer.runningAfterExtractHook());
          
          const enhancedContext = this.hookExecutor.createEnhancedContext(
            postExtractContext, this.fs, logger
          );
          
          const hookResult = await this.hookExecutor.executeHook(
            'afterExtract',
            toolConfig.installParams.hooks.afterExtract,
            enhancedContext
          );
          
          if (!hookResult.success) {
            return {
              success: false,
              error: `afterExtract hook failed: ${hookResult.error}`,
              };
          }
          
        }

        // Handle all binaries from extracted archive
        await this.setupBinariesFromArchive(toolFs, toolName, toolConfig, context, tempExtractDir, logger, extractResult);

        // Clean up temp extract directory
        logger.debug(DebugTemplates.installer.cleaningExtractDir(), tempExtractDir);
        await toolFs.rm(tempExtractDir, { recursive: true, force: true });
      } else {
        // Handle direct binary download
        await this.setupBinariesFromDirectDownload(toolFs, toolName, toolConfig, context, downloadPath, logger);
      }

      logger.debug(
        DebugTemplates.installer.githubReleaseFinalDestination(),
        context.installDir,
      );

      // Clean up downloaded archive if it was extracted
      if (
        (await toolFs.exists(downloadPath)) &&
        (asset.name.endsWith('.tar.gz') ||
          asset.name.endsWith('.tgz') ||
          asset.name.endsWith('.zip') ||
          asset.name.endsWith('.tar'))
      ) {
        logger.debug(DebugTemplates.installer.cleaningArchive(), downloadPath);
        await toolFs.rm(downloadPath);
      }

      // Return path to first binary for compatibility
      const primaryBinary = toolConfig.binaries?.[0] || toolName;
      const primaryBinaryPath = path.join(context.installDir, primaryBinary);

      return {
        success: true,
        binaryPath: primaryBinaryPath,
        version: release.tag_name,
        info: {
          releaseUrl: release.html_url,
          publishedAt: release.published_at,
          releaseName: release.name,
        },
      };
    } catch (error) {
      logger.error(ErrorTemplates.tool.installFailed('github-release', toolName, (error as Error).message));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a tool using Homebrew
   */
  public async installFromBrew(
    toolName: string,
    toolConfig: BrewToolConfig,
    _context: BaseInstallContext,
    options?: InstallOptions,
  ): Promise<InstallResult> {

    const logger = this.logger.getSubLogger({ name: 'installFromBrew' });
    logger.debug(DebugTemplates.installer.installingFromBrew(), toolName, toolConfig.installParams);

    if (!toolConfig.installParams) {
      return {
        success: false,
        error: 'Install parameters not specified',
      };
    }

    const params = toolConfig.installParams;
    const formula = params.formula || toolName;
    const isCask = params.cask || false;
    const tap = params.tap;

    try {
      // Check if brew is installed
      // This is a simplified check; in a real implementation, we would use
      // the IFileSystem to execute commands
      const brewCommand = 'brew';

      // Build the brew command
      let command = `${brewCommand} `;

      // Add tap if specified
      if (tap) {
        if (Array.isArray(tap)) {
          for (const t of tap) {
            command += `tap ${t} && ${brewCommand} `;
          }
        } else {
          command += `tap ${tap} && ${brewCommand} `;
        }
      }

      // Add install command
      command += isCask ? 'install --cask ' : 'install ';
      command += formula;

      // Add force flag if specified
      if (options?.force) {
        command += ' --force';
      }

      logger.debug(DebugTemplates.installer.executingCommand(), command);

      // In a real implementation, we would execute the command here
      // For now, we'll just simulate success

      // Handle all binaries by copying from brew installation to versioned directory
      const binaryNames = toolConfig.binaries || [toolName];
      for (const binaryName of binaryNames) {
        const sourcePath = `/usr/local/bin/${binaryName}`;
        const finalBinaryPath = path.join(_context.installDir, binaryName);
        
        // In a real implementation, we would copy from brew location to our versioned directory
        // For now, this is a placeholder that assumes brew installed the binary
        logger.debug(DebugTemplates.installer.movingBinary(), sourcePath, finalBinaryPath);
      }

      // Return path to first binary for compatibility
      const primaryBinary = toolConfig.binaries?.[0] || toolName;
      const primaryBinaryPath = path.join(_context.installDir, primaryBinary);

      return {
        success: true,
        binaryPath: primaryBinaryPath,
        info: {
          formula,
          isCask,
          tap,
        },
      };
    } catch (error) {
      logger.error(ErrorTemplates.tool.installFailed('brew', toolName, (error as Error).message));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a tool using a curl script
   */
  public async installFromCurlScript(
    toolName: string,
    toolConfig: CurlScriptToolConfig,
    context: BaseInstallContext,
    _options?: InstallOptions,
  ): Promise<InstallResult> {
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem 
      ? this.fs.withToolName(toolName)
      : this.fs;

    const logger = this.logger.getSubLogger({ name: 'installFromCurlScript' });
    logger.debug(DebugTemplates.installer.installingFromCurl(), toolName);

    if (
      !toolConfig.installParams ||
      !('url' in toolConfig.installParams) ||
      !('shell' in toolConfig.installParams)
    ) {
      return {
        success: false,
        error: 'URL or shell not specified in installParams',
      };
    }

    const params = toolConfig.installParams;
    const url = params.url;
    const shell = params.shell;

    try {
      // Download the script
      logger.debug(DebugTemplates.installer.downloadingScript(), url);
      const scriptPath = path.join(context.installDir, `${toolName}-install.sh`);
      
      const showProgress = shouldShowProgress(_options?.quiet);
      const progressBar = new ProgressBar(`${toolName}-install.sh`, { enabled: showProgress });
      
      try {
        await this.downloader.download(url, {
          destinationPath: scriptPath,
          onProgress: progressBar.createCallback(),
        });
      } finally {
        progressBar.finish();
      }

      // Make the script executable
      await toolFs.chmod(scriptPath, 0o755);

      // Run afterDownload hook if defined
      if (toolConfig.installParams?.hooks?.afterDownload) {
        logger.debug(DebugTemplates.installer.runningAfterDownloadHook());
        
        // Create context with download path for hook
        const postDownloadContext = {
          ...context,
          downloadPath: scriptPath,
        };
        
        const enhancedContext = this.hookExecutor.createEnhancedContext(
          postDownloadContext, this.fs, logger
        );
        
        const hookResult = await this.hookExecutor.executeHook(
          'afterDownload',
          toolConfig.installParams.hooks.afterDownload,
          enhancedContext
        );
        
        if (!hookResult.success) {
          return {
            success: false,
            error: `afterDownload hook failed: ${hookResult.error}`,
          };
        }
        
      }

      // Execute the script
      logger.debug(DebugTemplates.installer.executingScript(), shell);

      // In a real implementation, we would execute the script here
      // For now, we'll just simulate success

      // Handle all binaries by copying from script installation to versioned directory
      const binaryNames = toolConfig.binaries || [toolName];
      for (const binaryName of binaryNames) {
        const sourcePath = path.join('/usr/local/bin', binaryName); // Placeholder location
        const finalBinaryPath = path.join(context.installDir, binaryName);
        
        // In a real implementation, we would copy from script installation location to our versioned directory
        // For now, this is a placeholder that assumes script installed the binary
        logger.debug(DebugTemplates.installer.movingBinary(), sourcePath, finalBinaryPath);
      }

      // Return path to first binary for compatibility
      const primaryBinary = toolConfig.binaries?.[0] || toolName;
      const primaryBinaryPath = path.join(context.installDir, primaryBinary);

      return {
        success: true,
        binaryPath: primaryBinaryPath,
        info: {
          scriptUrl: url,
          shell,
        },
      };
    } catch (error) {
      logger.error(ErrorTemplates.tool.installFailed('curl-script', toolName, (error as Error).message));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a tool from a tarball using curl
   */
  public async installFromCurlTar(
    toolName: string,
    toolConfig: CurlTarToolConfig,
    context: BaseInstallContext,
    _options?: InstallOptions,
  ): Promise<InstallResult> {
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem 
      ? this.fs.withToolName(toolName)
      : this.fs;

    const logger = this.logger.getSubLogger({ name: 'installFromCurlTar' });
    logger.debug(DebugTemplates.installer.installingFromCurlTar(), toolName);

    // Context variables for lifecycle stages
    let postDownloadContext: PostDownloadInstallContext;
    let postExtractContext: PostExtractInstallContext | undefined;

    if (!toolConfig.installParams || !('url' in toolConfig.installParams)) {
      return {
        success: false,
        error: 'URL not specified in installParams',
      };
    }

    const params = toolConfig.installParams;
    const url = params.url;
    // extractPath is now handled as extractPathInArchive below

    try {
      // Download the tarball
      logger.debug(DebugTemplates.installer.downloadingTarball(), url);
      const tarballPath = path.join(context.installDir, `${toolName}.tar.gz`); // Assuming .tar.gz, adjust if needed
      
      const showProgress = shouldShowProgress(_options?.quiet);
      const progressBar = new ProgressBar(`${toolName}.tar.gz`, { enabled: showProgress });
      
      try {
        await this.downloader.download(url, {
          destinationPath: tarballPath,
          onProgress: progressBar.createCallback(),
        });
      } finally {
        progressBar.finish();
      }

      // Update context with download path
      postDownloadContext = {
        ...context,
        downloadPath: tarballPath,
      };

      // Run afterDownload hook if defined
      if (toolConfig.installParams?.hooks?.afterDownload) {
        logger.debug(DebugTemplates.installer.runningAfterDownloadHook());
        
        const enhancedContext = this.hookExecutor.createEnhancedContext(
          postDownloadContext, this.fs, logger
        );
        
        const hookResult = await this.hookExecutor.executeHook(
          'afterDownload',
          toolConfig.installParams.hooks.afterDownload,
          enhancedContext
        );
        
        if (!hookResult.success) {
          return {
            success: false,
            error: `afterDownload hook failed: ${hookResult.error}`,
          };
        }
        
      }

      // Extract the tarball to temporary directory
      logger.debug(DebugTemplates.installer.extractingTarball());
      const tempExtractDir = path.join(context.installDir, 'temp-extract');
      await toolFs.ensureDir(tempExtractDir);

      const extractResult: ExtractResult = await this.archiveExtractor.extract(tarballPath, {
        targetDir: tempExtractDir,
        stripComponents: params.stripComponents, // from CurlTarInstallParams
      });
      logger.debug(DebugTemplates.installer.tarballExtracted(), extractResult);

      // Update context with extract directory and result
      postExtractContext = {
        ...postDownloadContext,
        extractDir: tempExtractDir,
        extractResult,
      };

      // Run afterExtract hook if defined
      if (toolConfig.installParams?.hooks?.afterExtract) {
        logger.debug(DebugTemplates.installer.runningAfterExtractHook());
        
        const enhancedContext = this.hookExecutor.createEnhancedContext(
          postExtractContext, this.fs, logger
        );
        
        const hookResult = await this.hookExecutor.executeHook(
          'afterExtract',
          toolConfig.installParams.hooks.afterExtract,
          enhancedContext
        );
        
        if (!hookResult.success) {
          return {
            success: false,
            error: `afterExtract hook failed: ${hookResult.error}`,
          };
        }
        
      }

      // Handle all binaries from extracted archive  
      await this.setupBinariesFromArchive(toolFs, toolName, toolConfig, context, tempExtractDir, logger, extractResult);

      // Clean up temp extract directory
      logger.debug(DebugTemplates.installer.cleaningExtractDir(), tempExtractDir);
      await toolFs.rm(tempExtractDir, { recursive: true, force: true });

      // Clean up downloaded tarball
      if (await toolFs.exists(tarballPath)) {
        logger.debug(DebugTemplates.installer.cleaningArchive(), tarballPath);
        await toolFs.rm(tarballPath);
      }

      // Return path to first binary for compatibility
      const primaryBinary = toolConfig.binaries?.[0] || toolName;
      const primaryBinaryPath = path.join(context.installDir, primaryBinary);

      return {
        success: true,
        binaryPath: primaryBinaryPath,
        info: {
          tarballUrl: url,
        },
      };
    } catch (error) {
      logger.error(ErrorTemplates.tool.installFailed('curl-tar', toolName, (error as Error).message));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a tool manually
   */
  public async installManually(
    toolName: string,
    toolConfig: ManualToolConfig,
    context: BaseInstallContext,
    _options?: InstallOptions,
  ): Promise<InstallResult> {
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem 
      ? this.fs.withToolName(toolName)
      : this.fs;

    const logger = this.logger.getSubLogger({ name: 'installManually' });
    logger.debug(DebugTemplates.installer.installingManually(), toolName);

    if (!toolConfig.installParams || !('binaryPath' in toolConfig.installParams)) {
      return {
        success: false,
        error: 'Binary path not specified in installParams',
      };
    }

    const params = toolConfig.installParams;
    const rawBinaryPath = params.binaryPath as string;
    const binaryPath = expandToolConfigPath(toolConfig.configFilePath, rawBinaryPath, context.appConfig, context.systemInfo);

    try {
      // Check if the binary exists
      if (await toolFs.exists(binaryPath)) {
        // Handle all binaries by creating symlinks or copies to versioned directory
        const binaryNames = toolConfig.binaries || [toolName];
        for (const binaryName of binaryNames) {
          const finalBinaryPath = path.join(context.installDir, binaryName);
          
          // For manual installation, we create a symlink to the original binary
          // or copy it if the original path is specific to this binary
          if (binaryName === toolName || binaryNames.length === 1) {
            // Use the provided binaryPath for the primary binary or if only one binary
            await toolFs.ensureDir(path.dirname(finalBinaryPath));
            await toolFs.copyFile(binaryPath, finalBinaryPath);
            await toolFs.chmod(finalBinaryPath, 0o755);
          } else {
            // For additional binaries, they would need to be specified separately
            // This is a limitation of the current manual installation approach
            logger.debug(DebugTemplates.installer.manualMultipleBinariesNotSupported(), binaryName);
          }
        }

        // Return path to first binary for compatibility
        const primaryBinary = toolConfig.binaries?.[0] || toolName;
        const primaryBinaryPath = path.join(context.installDir, primaryBinary);

        return {
          success: true,
          binaryPath: primaryBinaryPath,
          info: {
            manualInstall: true,
            originalPath: binaryPath,
          },
        };
      } else {
        return {
          success: false,
          error: `Binary not found at ${binaryPath}`,
        };
      }
    } catch (error) {
      logger.error(ErrorTemplates.tool.installFailed('manual', toolName, (error as Error).message));
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
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

  /**
   * Setup binaries from extracted archive - handles all binaries in toolConfig.binaries[]
   */
  private async setupBinariesFromArchive(
    fs: IFileSystem,
    toolName: string,
    toolConfig: ToolConfig,
    context: BaseInstallContext,
    extractDir: string,
    logger: TsLogger,
    extractResult?: ExtractResult,
  ): Promise<void> {
    const binaryNames = toolConfig.binaries || [toolName];
    const installParams = toolConfig.installParams as any;
    
    // Determine the primary binary source path using the same logic as original
    let primarySourcePath: string;
    
    if (installParams?.binaryPath) {
      // Use explicit binaryPath from toolConfig.installParams (GitHub releases)
      primarySourcePath = path.join(extractDir, installParams.binaryPath);
    } else if (installParams?.extractPath) {
      // Use extractPath from toolConfig.installParams (curl-tar)
      primarySourcePath = path.join(extractDir, installParams.extractPath);
    } else if (extractResult?.executables && extractResult.executables.length > 0) {
      // Prefer the first executable found if multiple, or one that matches toolName
      const exeMatchingToolName = extractResult.executables.find(
        (exe) => path.basename(exe) === toolName
      );
      if (exeMatchingToolName) {
        primarySourcePath = path.join(extractDir, exeMatchingToolName);
      } else if (extractResult.executables.length) {
        primarySourcePath = path.join(extractDir, extractResult.executables[0] as string);
      } else {
        primarySourcePath = path.join(extractDir, toolName);
      }
      logger.debug(DebugTemplates.installer.foundExecutable(), primarySourcePath);
    } else if (extractResult?.extractedFiles && extractResult.extractedFiles.length === 1) {
      // If only one file was extracted, assume it's the binary
      primarySourcePath = path.join(extractDir, extractResult.extractedFiles[0] as string);
      logger.debug(DebugTemplates.installer.assumingSingleBinary(), primarySourcePath);
    } else if (extractResult?.extractedFiles) {
      // Fallback: attempt to find a file named like the tool
      const potentialBinary = extractResult.extractedFiles.find((f) => f.includes(toolName));
      if (potentialBinary) {
        primarySourcePath = path.join(extractDir, potentialBinary);
        logger.debug(DebugTemplates.installer.attemptingFallback(), primarySourcePath);
      } else {
        logger.debug(DebugTemplates.installer.noExecutableFound(), extractResult.extractedFiles);
        primarySourcePath = path.join(extractDir, toolName); // Default fallback
      }
    } else {
      // No extractResult provided, fallback to toolName
      primarySourcePath = path.join(extractDir, toolName);
    }

    // Verify the primary binary exists and copy it
    if (!(await fs.exists(primarySourcePath))) {
      const errorMsg = `Binary not found at expected path after extraction: ${primarySourcePath}${
        extractResult?.extractedFiles ? `. Extracted files: ${extractResult.extractedFiles.join(', ')}` : ''
      }`;
      throw new Error(errorMsg);
    }

    // Handle the primary binary
    const primaryBinary = binaryNames[0] || toolName;
    const finalPrimaryPath = path.join(context.installDir, primaryBinary);
    
    logger.debug(DebugTemplates.installer.movingBinary(), primarySourcePath, finalPrimaryPath);
    await fs.copyFile(primarySourcePath, finalPrimaryPath);
    
    // Handle additional binaries if any (for future multiple binary support)
    for (let i = 1; i < binaryNames.length; i++) {
      const binaryName = binaryNames[i];
      if (binaryName) {
        const additionalSourcePath = path.join(extractDir, binaryName);
        const additionalFinalPath = path.join(context.installDir, binaryName);
        
        if (await fs.exists(additionalSourcePath)) {
          logger.debug(DebugTemplates.installer.movingBinary(), additionalSourcePath, additionalFinalPath);
          await fs.copyFile(additionalSourcePath, additionalFinalPath);
        } else {
          logger.debug(DebugTemplates.installer.binaryNotFound(), binaryName, additionalSourcePath);
        }
      }
    }
  }

  /**
   * Setup binaries from direct download - handles all binaries in toolConfig.binaries[]
   */
  private async setupBinariesFromDirectDownload(
    fs: IFileSystem,
    toolName: string,
    toolConfig: ToolConfig,
    context: BaseInstallContext,
    downloadPath: string,
    logger: TsLogger,
  ): Promise<void> {
    const binaryNames = toolConfig.binaries || [toolName];
    
    // For direct downloads, we only have one file, so use it for the first binary
    const primaryBinary = binaryNames[0] || toolName;
    const finalBinaryPath = path.join(context.installDir, primaryBinary);
    
    logger.debug(DebugTemplates.installer.movingBinary(), downloadPath, finalBinaryPath);
    await fs.copyFile(downloadPath, finalBinaryPath);
    
    // Make binary executable for direct downloads (may not preserve permissions)
    await fs.chmod(finalBinaryPath, 0o755);
    
    // Clean up original downloaded file if it was renamed
    if (downloadPath !== finalBinaryPath && (await fs.exists(downloadPath))) {
      logger.debug(DebugTemplates.installer.cleaningArchive(), downloadPath);
      await fs.rm(downloadPath);
    }
    
    // For direct downloads with multiple binary names, we can't provide them all
    // Log a warning if multiple binaries were requested
    if (binaryNames.length > 1) {
      logger.debug(DebugTemplates.installer.directDownloadSingleBinary(), binaryNames.length.toString(), primaryBinary);
    }
  }
}
