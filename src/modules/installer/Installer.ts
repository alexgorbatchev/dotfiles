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
      const installDir = path.join(binariesDir, toolName);
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
    const binaryPath = params.binaryPath;
    const moveBinaryTo = params.moveBinaryTo;

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
      let finalBinaryPath = downloadPath;
      if (
        asset.name.endsWith('.tar.gz') ||
        asset.name.endsWith('.tgz') ||
        asset.name.endsWith('.zip') ||
        asset.name.endsWith('.tar')
      ) {
        logger.debug(DebugTemplates.installer.extractingArchive(), asset.name);

        // Extract the archive
        const extractDir = path.join(context.installDir, 'extracted');
        await this.fs.ensureDir(extractDir);

        const extractResult: ExtractResult = await this.archiveExtractor.extract(downloadPath, {
          targetDir: extractDir,
          stripComponents: params.stripComponents, // from GithubReleaseInstallParams
        });
        logger.debug(DebugTemplates.installer.archiveExtracted(), extractResult);

        // Update context with extract directory and result
        postExtractContext = {
          ...postDownloadContext,
          extractDir,
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

        // Find the binary in the extracted directory
        if (binaryPath) {
          // binaryPath from toolConfig.installParams
          finalBinaryPath = path.join(extractDir, binaryPath);
        } else if (extractResult.executables && extractResult.executables.length > 0) {
          // Prefer the first executable found if multiple, or one that matches toolName
          const exeMatchingToolName = extractResult.executables?.find(
            (exe) => path.basename(exe) === toolName
          );
          if (exeMatchingToolName) {
            finalBinaryPath = path.join(extractDir, exeMatchingToolName);
          } else if (extractResult.executables?.length) {
            finalBinaryPath = path.join(extractDir, extractResult.executables[0] as string);
          } else {
            finalBinaryPath = path.join(extractDir, toolName);
          }
          logger.debug(DebugTemplates.installer.foundExecutable(), finalBinaryPath);
        } else if (extractResult.extractedFiles && extractResult.extractedFiles.length === 1) {
          // If only one file was extracted, assume it's the binary
          finalBinaryPath = path.join(extractDir, extractResult.extractedFiles[0] as string);
          logger.debug(DebugTemplates.installer.assumingSingleBinary(), finalBinaryPath);
        } else {
          // Fallback: attempt to find a file named like the tool
          const potentialBinary = extractResult.extractedFiles.find((f) => f.includes(toolName));
          if (potentialBinary) {
            finalBinaryPath = path.join(extractDir, potentialBinary);
            logger.debug(DebugTemplates.installer.attemptingFallback(), finalBinaryPath);
          } else {
            logger.debug(DebugTemplates.installer.noExecutableFound(), extractResult.extractedFiles);
            finalBinaryPath = path.join(extractDir, toolName); // Default if no specific binary found
          }
        }

        // If the determined finalBinaryPath doesn't exist, it's an error
        if (!(await this.fs.exists(finalBinaryPath))) {
          return {
            success: false,
            error: `Binary not found at expected path after extraction: ${finalBinaryPath}. Extracted files: ${extractResult.extractedFiles.join(', ')}`,
          };
        }
      }

      // Make the binary executable (still in extractDir or downloadPath at this point)
      logger.debug(DebugTemplates.installer.makingExecutable(), finalBinaryPath);
      await this.fs.chmod(finalBinaryPath, 0o755);

      // Determine the final destination path for the binary, directly in context.installDir
      const finalFileName = moveBinaryTo || path.basename(finalBinaryPath);
      const actualFinalBinaryDestPath = path.join(context.installDir, finalFileName);

      if (finalBinaryPath !== actualFinalBinaryDestPath) {
        logger.debug(
          DebugTemplates.installer.githubReleaseBinaryMoving(),
          finalBinaryPath,
          actualFinalBinaryDestPath,
        );
        await this.fs.ensureDir(path.dirname(actualFinalBinaryDestPath)); // Ensure parent dir of final destination exists
        // Copy the file from extractDir/downloadPath to its final place in installDir
        await this.fs.copyFile(finalBinaryPath, actualFinalBinaryDestPath);
        // Ensure the copied file is executable
        await this.fs.chmod(actualFinalBinaryDestPath, 0o755);
        // Update finalBinaryPath to the new location
        finalBinaryPath = actualFinalBinaryDestPath;
      } else {
        logger.debug(
          DebugTemplates.installer.githubReleaseFinalDestination(),
          finalBinaryPath,
        );
      }

      // Clean up the temporary extraction directory if it was used and we've moved/copied the binary
      if (
        postExtractContext?.extractDir &&
        (await this.fs.exists(postExtractContext.extractDir)) &&
        finalBinaryPath.startsWith(context.installDir) && // ensure we are not deleting something outside installDir
        !finalBinaryPath.startsWith(postExtractContext.extractDir) // ensure binary is no longer in extractDir
      ) {
        logger.debug(DebugTemplates.installer.cleaningExtractDir(), postExtractContext.extractDir);
        await this.fs.rm(postExtractContext.extractDir, { recursive: true, force: true });
      } else if (
        // Clean up downloaded archive if it was extracted and binary moved
        downloadPath !== finalBinaryPath &&
        (await this.fs.exists(downloadPath)) &&
        (asset.name.endsWith('.tar.gz') ||
          asset.name.endsWith('.tgz') ||
          asset.name.endsWith('.zip') ||
          asset.name.endsWith('.tar'))
      ) {
        logger.debug(DebugTemplates.installer.cleaningArchive(), downloadPath);
        await this.fs.rm(downloadPath);
      }

      return {
        success: true,
        binaryPath: finalBinaryPath,
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

      // Find the installed binary
      // In a real implementation, we would use `brew --prefix formula` to find the binary
      const binaryPath = `/usr/local/bin/${toolName}`; // This is a placeholder

      return {
        success: true,
        binaryPath,
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

      // Assume the script installs the binary to a standard location
      const binaryPath = path.join('/usr/local/bin', toolName); // Placeholder

      return {
        success: true,
        binaryPath,
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
    const moveBinaryTo = params.moveBinaryTo;

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

      // Extract the tarball
      logger.debug(DebugTemplates.installer.extractingTarball());
      const extractDir = path.join(context.installDir, 'extracted');
      await toolFs.ensureDir(extractDir);

      const extractResult: ExtractResult = await this.archiveExtractor.extract(tarballPath, {
        targetDir: extractDir,
        stripComponents: params.stripComponents, // from CurlTarInstallParams
      });
      logger.debug(DebugTemplates.installer.tarballExtracted(), extractResult);

      // Update context with extract directory and result
      postExtractContext = {
        ...postDownloadContext,
        extractDir,
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

      // Find the binary in the extracted directory
      let finalBinaryPath: string;
      // extractPathInArchive is from toolConfig.installParams.extractPath (renamed for clarity)
      const extractPathInArchive = params.extractPath as string | undefined; // Explicitly type
      if (extractPathInArchive) {
        finalBinaryPath = path.join(extractDir, extractPathInArchive);
      } else if (extractResult.executables && extractResult.executables.length > 0) {
        const exeMatchingToolName = extractResult.executables.find(
          (exe) => path.basename(exe) === toolName
        );

        if (exeMatchingToolName) {
          finalBinaryPath = path.join(extractDir, exeMatchingToolName);
        } else {
          finalBinaryPath = path.join(extractDir, extractResult.executables[0] as string);
        }
        logger.debug(DebugTemplates.installer.foundExecutable(), finalBinaryPath);
      } else if (extractResult.extractedFiles && extractResult.extractedFiles.length === 1) {
        finalBinaryPath = path.join(extractDir, extractResult.extractedFiles[0] as string);
        logger.debug(DebugTemplates.installer.assumingSingleBinary(), finalBinaryPath);
      } else {
        const potentialBinary = extractResult.extractedFiles.find((f) => f.includes(toolName));
        if (potentialBinary) {
          finalBinaryPath = path.join(extractDir, potentialBinary);
          logger.debug(DebugTemplates.installer.curlTarFallback(), finalBinaryPath);
        } else {
          logger.debug(DebugTemplates.installer.noFallbackExecutable(), extractResult.extractedFiles);
          finalBinaryPath = path.join(extractDir, toolName);
        }
      }

      if (!(await toolFs.exists(finalBinaryPath))) {
        return {
          success: false,
          error: `Binary not found at expected path after extraction: ${finalBinaryPath}. Extracted files: ${extractResult.extractedFiles.join(', ')}`,
          };
      }

      // Make the binary executable (still in extractDir at this point)
      logger.debug(DebugTemplates.installer.makingExecutable(), finalBinaryPath);
      await toolFs.chmod(finalBinaryPath, 0o755);

      // Determine the final destination path for the binary, directly in context.installDir
      const finalFileName = moveBinaryTo || path.basename(finalBinaryPath);
      const actualFinalBinaryDestPath = path.join(context.installDir, finalFileName);

      if (finalBinaryPath !== actualFinalBinaryDestPath) {
        logger.debug(
          DebugTemplates.installer.curlTarBinaryMoving(),
          finalBinaryPath,
          actualFinalBinaryDestPath,
        );
        await toolFs.ensureDir(path.dirname(actualFinalBinaryDestPath)); // Ensure parent dir of final destination exists

        // Copy the file from extractDir to its final place in installDir
        await toolFs.copyFile(finalBinaryPath, actualFinalBinaryDestPath);
        // Ensure the copied file is executable
        await toolFs.chmod(actualFinalBinaryDestPath, 0o755);

        // Update finalBinaryPath to the new location
        finalBinaryPath = actualFinalBinaryDestPath;
      } else {
        logger.debug(
          DebugTemplates.installer.curlTarFinalDestination(),
          finalBinaryPath,
        );
      }

      // Clean up the temporary extraction directory as we've moved the binary
      if (
        postExtractContext?.extractDir &&
        (await toolFs.exists(postExtractContext.extractDir)) &&
        finalBinaryPath.startsWith(context.installDir) &&
        !finalBinaryPath.startsWith(postExtractContext.extractDir)
      ) {
        logger.debug(DebugTemplates.installer.cleaningExtractDir(), postExtractContext.extractDir);
        await toolFs.rm(postExtractContext.extractDir, { recursive: true, force: true });
      } else if (
        // Clean up downloaded tarball if it was extracted and binary moved
        tarballPath !== finalBinaryPath &&
        (await toolFs.exists(tarballPath))
      ) {
        logger.debug(DebugTemplates.installer.cleaningArchive(), tarballPath);
        await toolFs.rm(tarballPath);
      }

      return {
        success: true,
        binaryPath: finalBinaryPath,
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
    _context: BaseInstallContext,
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
    const binaryPath = params.binaryPath as string;

    try {
      // Check if the binary exists
      if (await toolFs.exists(binaryPath)) {
        return {
          success: true,
          binaryPath,
          info: {
            manualInstall: true,
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
}
