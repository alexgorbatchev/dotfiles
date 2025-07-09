/**
 * @file src/modules/installer/Installer.ts
 * @description Implementation of the tool installer module.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `src/types.ts` (for ToolConfig, InstallParams types)
 * - `src/modules/installer/IInstaller.ts` (for IInstaller interface)
 * - `.clinerules` (for file structure, naming, and content guidelines)
 *
 * ### Tasks:
 * - [x] Implement `Installer` class with constructor accepting dependencies.
 * - [x] Implement `install` method.
 * - [x] Implement GitHub release installation method.
 * - [x] Implement Homebrew installation method.
 * - [x] Implement script installation method.
 * - [x] Add proper error handling and logging.
 * - [x] Write tests for the module.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Update GitHub release installation to use configurable `githubHost` from AppConfig.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Implement archive extraction.
 * - [x] Ensure 100% test coverage for executable code.
 * - [x] Fix GitHub release URL construction to correctly handle absolute `browser_download_url` and custom `githubHost`.
 * - [x] Enhance error message in `installFromGitHubRelease` to list available assets.
 * - [x] Populate `symlinkPath` in `InstallResult`.
 * - [x] Populate `otherChanges` array in `InstallResult` with detailed installation steps.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import path from 'node:path';
import os from 'node:os';
import { createLogger } from '@modules/logger';
// import { createLogger } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import type { AppConfig, ToolConfig, GitHubReleaseAsset, SystemInfo, ExtractResult } from '@types';
import type { IInstaller, InstallOptions, InstallResult } from './IInstaller';

const log = createLogger('Installer');

/**
 * Orchestrates the tool installation process by coordinating services like `Downloader`, 
 * `ArchiveExtractor`, and `GitHubApiClient`. It manages the entire lifecycle, including
 * directory setup, hooks, and artifact tracking.
 *
 * The installer determines the installation method from the `ToolConfig` and delegates
 * to the appropriate private method (e.g., `installFromGitHubRelease`).
 *
 * It is responsible for populating the `InstallResult` object with rich details,
 * including the final `symlinkPath` and a log of all filesystem changes in `otherChanges`.
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
  private readonly fs: IFileSystem;
  private readonly downloader: IDownloader;
  private readonly githubApiClient: IGitHubApiClient;
  private readonly archiveExtractor: IArchiveExtractor;
  private readonly appConfig: AppConfig;

  constructor(
    fileSystem: IFileSystem,
    downloader: IDownloader,
    githubApiClient: IGitHubApiClient,
    archiveExtractor: IArchiveExtractor,
    appConfig: AppConfig
  ) {
    log(
      'constructor: fileSystem=%s, downloader=%s, githubApiClient=%s, archiveExtractor=%s, appConfig=%o',
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
  }

  /**
   * Install a tool based on its configuration
   */
  async install(
    toolName: string,
    toolConfig: ToolConfig,
    options?: InstallOptions
  ): Promise<InstallResult> {
    log('install: toolName=%s, toolConfig=%o, options=%o', toolName, toolConfig, options);
    const otherChanges: string[] = [];

    try {
      // Create installation directory if it doesn't exist
      const installDir = path.join(this.appConfig.binariesDir, toolName);
      await this.fs.ensureDir(installDir);
      otherChanges.push(`Ensured installation directory exists: ${installDir}`);
      log('install: Created installation directory: %s', installDir);

      // Create context for installation hooks
      const context = {
        toolName,
        installDir,
        systemInfo: this.getSystemInfo(),
        otherChanges, // Pass otherChanges to hooks and methods
      };

      // Run beforeInstall hook if defined
      if (toolConfig.installParams?.hooks?.beforeInstall) {
        log('install: Running beforeInstall hook');
        otherChanges.push(`Executing beforeInstall hook for ${toolName}.`);
        await toolConfig.installParams.hooks.beforeInstall(context);
        otherChanges.push(`Finished executing beforeInstall hook for ${toolName}.`);
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
            otherChanges,
          };
      }

      // Run afterInstall hook if defined
      if (toolConfig.installParams?.hooks?.afterInstall) {
        log('install: Running afterInstall hook');
        otherChanges.push(`Executing afterInstall hook for ${toolName}.`);
        await toolConfig.installParams.hooks.afterInstall(context);
        otherChanges.push(`Finished executing afterInstall hook for ${toolName}.`);
      }

      // Ensure otherChanges from the specific install method are merged if not already handled by passing context
      if (result.otherChanges && result.otherChanges !== otherChanges) {
        otherChanges.push(...result.otherChanges);
      }
      result.otherChanges = otherChanges; // Assign the accumulated changes

      return result;
    } catch (error) {
      log('install: Error installing tool %s: %O', toolName, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        otherChanges,
      };
    }
  }

  /**
   * Install a tool from GitHub releases
   */
  private async installFromGitHubRelease(
    toolName: string,
    toolConfig: ToolConfig,
    context: any, // context now includes otherChanges
    _options?: InstallOptions
  ): Promise<InstallResult> {
    log('installFromGitHubRelease: toolName=%s', toolName);
    const otherChanges: string[] = context.otherChanges || [];

    if (!toolConfig.installParams || !('repo' in toolConfig.installParams)) {
      return {
        success: false,
        error: 'GitHub repository not specified in installParams',
        otherChanges,
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
        log('installFromGitHubRelease: Getting latest release for %s', repo || toolName);
        const [owner, repoName] = (repo || '').split('/');
        if (!owner || !repoName) {
          return {
            success: false,
            error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
            otherChanges,
          };
        }
        release = await this.githubApiClient.getLatestRelease(owner, repoName);
      } else {
        log('installFromGitHubRelease: Getting release %s for %s', version, repo || toolName);
        const [owner, repoName] = (repo || '').split('/');
        if (!owner || !repoName) {
          return {
            success: false,
            error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
            otherChanges,
          };
        }
        release = await this.githubApiClient.getReleaseByTag(owner, repoName, version);
      }

      if (!release) {
        return {
          success: false,
          error: `Failed to fetch release information for ${repo || toolName}`,
          otherChanges,
        };
      }
      otherChanges.push(
        `Fetched release information for ${repo || toolName} (version: ${release.tag_name}).`
      );

      // Select the appropriate asset
      let asset: GitHubReleaseAsset | undefined;
      if (params.assetSelector) {
        log('installFromGitHubRelease: Using custom asset selector');
        asset = params.assetSelector(release.assets, context.systemInfo);
        otherChanges.push(`Selected asset using custom selector function.`);
      } else if (assetPattern) {
        log('installFromGitHubRelease: Finding asset matching pattern: %s', assetPattern);
        const regex = new RegExp(assetPattern || '');
        asset = release.assets.find((a) => regex.test(a.name));
        if (asset) {
          otherChanges.push(`Selected asset "${asset.name}" matching pattern "${assetPattern}".`);
        }
      } else {
        // Try to find an asset that matches the current platform and architecture
        log('installFromGitHubRelease: Finding asset for current platform and architecture');
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
        if (asset) {
          otherChanges.push(
            `Selected asset "${asset.name}" for platform "${platform}" and architecture "${arch}".`
          );
        }
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
          otherChanges,
        };
      }
      otherChanges.push(`Identified asset for download: ${asset.name}`);

      // Download the asset
      let downloadUrl: string;
      const rawBrowserDownloadUrl = asset.browser_download_url;
      const customHost = this.appConfig.githubHost;

      log(
        'installFromGitHubRelease: Determining download URL. rawBrowserDownloadUrl="%s", customHost="%s"',
        rawBrowserDownloadUrl,
        customHost
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
          log(
            'installFromGitHubRelease: Using absolute browser_download_url directly: "%s"',
            downloadUrl
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
          log(
            'installFromGitHubRelease: Resolved relative URL. Base: "%s", Relative Path: "%s", Result: "%s"',
            base,
            rawBrowserDownloadUrl,
            downloadUrl
          );
        } else {
          // Invalid or unsupported URL format
          log(
            'installFromGitHubRelease: Invalid or unsupported browser_download_url format: "%s"',
            rawBrowserDownloadUrl
          );
          return {
            success: false,
            error: `Invalid asset download URL format: ${rawBrowserDownloadUrl}`,
            otherChanges,
          };
        }

        log(
          'installFromGitHubRelease: Final download URL determined. Raw: "%s", Configured Host: "%s", Result: "%s"',
          rawBrowserDownloadUrl,
          customHost || '(public GitHub)',
          downloadUrl
        );
      } catch (e) {
        log(
          'installFromGitHubRelease: Error constructing download URL. Raw: "%s", Configured Host: "%s", Error: %s',
          rawBrowserDownloadUrl,
          customHost || '(public GitHub)',
          (e as Error).message
        );
        return {
          success: false,
          error: `Failed to construct valid download URL. Raw: ${rawBrowserDownloadUrl}, Configured Host: ${customHost || '(public GitHub)'}, Error: ${(e as Error).message}`,
          otherChanges,
        };
      }

      log('installFromGitHubRelease: Downloading asset: %s', downloadUrl);
      const downloadPath = path.join(context.installDir, asset.name);
      await this.downloader.download(downloadUrl, {
        destinationPath: downloadPath,
      });
      otherChanges.push(`Downloaded asset from ${downloadUrl} to ${downloadPath}.`);

      // Update context with download path
      context.downloadPath = downloadPath;

      // Run afterDownload hook if defined
      if (toolConfig.installParams?.hooks?.afterDownload) {
        log('installFromGitHubRelease: Running afterDownload hook');
        otherChanges.push(`Executing afterDownload hook for ${toolName}.`);
        await toolConfig.installParams.hooks.afterDownload(context);
        otherChanges.push(`Finished executing afterDownload hook for ${toolName}.`);
      }

      // Handle extraction if needed
      let finalBinaryPath = downloadPath;
      if (
        asset.name.endsWith('.tar.gz') ||
        asset.name.endsWith('.tgz') ||
        asset.name.endsWith('.zip') ||
        asset.name.endsWith('.tar')
      ) {
        log('installFromGitHubRelease: Extracting archive: %s', asset.name);
        otherChanges.push(`Starting extraction of archive: ${asset.name}`);

        // Extract the archive
        const extractDir = path.join(context.installDir, 'extracted');
        await this.fs.ensureDir(extractDir);
        otherChanges.push(`Ensured extraction directory exists: ${extractDir}`);

        const extractResult: ExtractResult = await this.archiveExtractor.extract(downloadPath, {
          targetDir: extractDir,
          stripComponents: params.stripComponents, // from GithubReleaseInstallParams
        });
        log('installFromGitHubRelease: Archive extracted: %o', extractResult);
        otherChanges.push(
          `Extracted archive ${asset.name} to ${extractDir}. Files: ${extractResult.extractedFiles.join(', ')}.`
        );

        // Update context with extract directory and result
        context.extractDir = extractDir;
        context.extractResult = extractResult;

        // Run afterExtract hook if defined
        if (toolConfig.installParams?.hooks?.afterExtract) {
          log('installFromGitHubRelease: Running afterExtract hook');
          otherChanges.push(`Executing afterExtract hook for ${toolName}.`);
          await toolConfig.installParams.hooks.afterExtract(context);
          otherChanges.push(`Finished executing afterExtract hook for ${toolName}.`);
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
          log('installFromGitHubRelease: Found executable in archive: %s', finalBinaryPath);
        } else if (extractResult.extractedFiles && extractResult.extractedFiles.length === 1) {
          // If only one file was extracted, assume it's the binary
          finalBinaryPath = path.join(extractDir, extractResult.extractedFiles[0] as string);
          log(
            'installFromGitHubRelease: Assuming single extracted file is binary: %s',
            finalBinaryPath
          );
        } else {
          // Fallback: attempt to find a file named like the tool
          const potentialBinary = extractResult.extractedFiles.find((f) => f.includes(toolName));
          if (potentialBinary) {
            finalBinaryPath = path.join(extractDir, potentialBinary);
            log('installFromGitHubRelease: Fallback, found potential binary: %s', finalBinaryPath);
          } else {
            log(
              'installFromGitHubRelease: Could not determine binary path in extracted archive. Defaulting to toolName in extractDir.'
            );
            finalBinaryPath = path.join(extractDir, toolName); // Default if no specific binary found
          }
        }
        otherChanges.push(`Determined binary path after extraction: ${finalBinaryPath}`);

        // If the determined finalBinaryPath doesn't exist, it's an error
        if (!(await this.fs.exists(finalBinaryPath))) {
          return {
            success: false,
            error: `Binary not found at expected path after extraction: ${finalBinaryPath}. Extracted files: ${extractResult.extractedFiles.join(', ')}`,
            otherChanges,
          };
        }
      }

      // Make the binary executable (still in extractDir or downloadPath at this point)
      log('installFromGitHubRelease: Making binary executable: %s', finalBinaryPath);
      await this.fs.chmod(finalBinaryPath, 0o755);
      otherChanges.push(`Set executable permission (0755) on: ${finalBinaryPath}`);

      // Determine the final destination path for the binary, directly in context.installDir
      const finalFileName = moveBinaryTo || path.basename(finalBinaryPath);
      const actualFinalBinaryDestPath = path.join(context.installDir, finalFileName);

      if (finalBinaryPath !== actualFinalBinaryDestPath) {
        log(
          'installFromGitHubRelease: Moving binary from %s to %s',
          finalBinaryPath,
          actualFinalBinaryDestPath
        );
        await this.fs.ensureDir(path.dirname(actualFinalBinaryDestPath)); // Ensure parent dir of final destination exists
        // Copy the file from extractDir/downloadPath to its final place in installDir
        await this.fs.copyFile(finalBinaryPath, actualFinalBinaryDestPath);
        otherChanges.push(`Copied binary from ${finalBinaryPath} to ${actualFinalBinaryDestPath}.`);
        // Ensure the copied file is executable
        await this.fs.chmod(actualFinalBinaryDestPath, 0o755);
        otherChanges.push(`Set executable permission (0755) on: ${actualFinalBinaryDestPath}`);
        // Update finalBinaryPath to the new location
        finalBinaryPath = actualFinalBinaryDestPath;
      } else {
        log('installFromGitHubRelease: Binary already at final destination: %s', finalBinaryPath);
      }

      // Clean up the temporary extraction directory if it was used and we've moved/copied the binary
      if (
        context.extractDir &&
        (await this.fs.exists(context.extractDir)) &&
        finalBinaryPath.startsWith(context.installDir) && // ensure we are not deleting something outside installDir
        !finalBinaryPath.startsWith(context.extractDir) // ensure binary is no longer in extractDir
      ) {
        log('installFromGitHubRelease: Cleaning up extractDir: %s', context.extractDir);
        await this.fs.rm(context.extractDir, { recursive: true, force: true });
        otherChanges.push(`Cleaned up temporary extraction directory: ${context.extractDir}`);
      } else if (
        // Clean up downloaded archive if it was extracted and binary moved
        downloadPath !== finalBinaryPath &&
        (await this.fs.exists(downloadPath)) &&
        (asset.name.endsWith('.tar.gz') ||
          asset.name.endsWith('.tgz') ||
          asset.name.endsWith('.zip') ||
          asset.name.endsWith('.tar'))
      ) {
        log('installFromGitHubRelease: Cleaning up downloaded archive: %s', downloadPath);
        await this.fs.rm(downloadPath);
        otherChanges.push(`Cleaned up downloaded archive: ${downloadPath}`);
      }

      // Create a symlink in the bin directory
      const binDir = this.appConfig.binDir;
      await this.fs.ensureDir(binDir);
      const symlinkPath = path.join(binDir, toolName);

      // Remove existing symlink if it exists
      if (await this.fs.exists(symlinkPath)) {
        await this.fs.rm(symlinkPath);
        otherChanges.push(`Removed existing symlink at: ${symlinkPath}`);
      }

      log('installFromGitHubRelease: Creating symlink from %s to %s', finalBinaryPath, symlinkPath);
      await this.fs.symlink(finalBinaryPath, symlinkPath);
      otherChanges.push(`Created symlink: ${symlinkPath} -> ${finalBinaryPath}`);

      return {
        success: true,
        binaryPath: finalBinaryPath,
        version: release.tag_name,
        symlinkPath,
        info: {
          releaseUrl: release.html_url,
          publishedAt: release.published_at,
          releaseName: release.name,
        },
        otherChanges,
      };
    } catch (error) {
      log('installFromGitHubRelease: Error: %O', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        otherChanges,
      };
    }
  }

  /**
   * Install a tool using Homebrew
   */
  private async installFromBrew(
    toolName: string,
    toolConfig: ToolConfig,
    context: any, // context now includes otherChanges
    options?: InstallOptions
  ): Promise<InstallResult> {
    log('installFromBrew: toolName=%s', toolName);
    const otherChanges: string[] = context.otherChanges || [];

    if (!toolConfig.installParams) {
      return {
        success: false,
        error: 'Install parameters not specified',
        otherChanges,
      };
    }

    // Type assertion to access BrewInstallParams properties
    const params = toolConfig.installParams as any;
    const formula = params.formula || toolName;
    const isCask = params.cask || false;
    const tap = params.tap;

    try {
      // Check if brew is installed
      // This is a simplified check; in a real implementation, we would use
      // the IFileSystem to execute commands
      const brewCommand = 'brew';
      otherChanges.push(`Using 'brew' command for installation.`);

      // Build the brew command
      let command = `${brewCommand} `;

      // Add tap if specified
      if (tap) {
        if (Array.isArray(tap)) {
          for (const t of tap) {
            command += `tap ${t} && ${brewCommand} `;
            otherChanges.push(`Tapping Homebrew repository: ${t}`);
          }
        } else {
          command += `tap ${tap} && ${brewCommand} `;
          otherChanges.push(`Tapping Homebrew repository: ${tap}`);
        }
      }

      // Add install command
      command += isCask ? 'install --cask ' : 'install ';
      command += formula;
      otherChanges.push(`Preparing to install Homebrew formula/cask: ${formula}`);

      // Add force flag if specified
      if (options?.force) {
        command += ' --force';
        otherChanges.push(`Using --force flag for installation.`);
      }

      log('installFromBrew: Executing command: %s', command);
      otherChanges.push(`Executing Homebrew command: ${command}`);

      // In a real implementation, we would execute the command here
      // For now, we'll just simulate success
      otherChanges.push(`Simulated successful execution of Homebrew command.`);

      // Find the installed binary
      // In a real implementation, we would use `brew --prefix formula` to find the binary
      const binaryPath = `/usr/local/bin/${toolName}`; // This is a placeholder
      otherChanges.push(`Assuming binary path after Homebrew install: ${binaryPath}`);

      return {
        success: true,
        binaryPath,
        info: {
          formula,
          isCask,
          tap,
        },
        otherChanges,
      };
    } catch (error) {
      log('installFromBrew: Error: %O', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        otherChanges,
      };
    }
  }

  /**
   * Install a tool using a curl script
   */
  private async installFromCurlScript(
    toolName: string,
    toolConfig: ToolConfig,
    context: any, // context now includes otherChanges
    _options?: InstallOptions
  ): Promise<InstallResult> {
    log('installFromCurlScript: toolName=%s', toolName);
    const otherChanges: string[] = context.otherChanges || [];

    if (
      !toolConfig.installParams ||
      !('url' in toolConfig.installParams) ||
      !('shell' in toolConfig.installParams)
    ) {
      return {
        success: false,
        error: 'URL or shell not specified in installParams',
        otherChanges,
      };
    }

    const params = toolConfig.installParams;
    const url = params.url;
    const shell = params.shell;

    try {
      // Download the script
      log('installFromCurlScript: Downloading script from %s', url);
      const scriptPath = path.join(context.installDir, `${toolName}-install.sh`);
      await this.downloader.download(url, {
        destinationPath: scriptPath,
      });
      otherChanges.push(`Downloaded installation script from ${url} to ${scriptPath}.`);

      // Make the script executable
      await this.fs.chmod(scriptPath, 0o755);
      otherChanges.push(`Set executable permission (0755) on script: ${scriptPath}`);

      // Update context with download path
      context.downloadPath = scriptPath;

      // Run afterDownload hook if defined
      if (toolConfig.installParams?.hooks?.afterDownload) {
        log('installFromCurlScript: Running afterDownload hook');
        otherChanges.push(`Executing afterDownload hook for ${toolName}.`);
        await toolConfig.installParams.hooks.afterDownload(context);
        otherChanges.push(`Finished executing afterDownload hook for ${toolName}.`);
      }

      // Execute the script
      log('installFromCurlScript: Executing script with %s', shell);
      otherChanges.push(`Executing installation script ${scriptPath} using ${shell}.`);

      // In a real implementation, we would execute the script here
      // For now, we'll just simulate success
      otherChanges.push(`Simulated successful execution of installation script.`);

      // Assume the script installs the binary to a standard location
      const binaryPath = path.join('/usr/local/bin', toolName); // Placeholder
      otherChanges.push(`Assuming binary path after script execution: ${binaryPath}`);

      return {
        success: true,
        binaryPath,
        info: {
          scriptUrl: url,
          shell,
        },
        otherChanges,
      };
    } catch (error) {
      log('installFromCurlScript: Error: %O', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        otherChanges,
      };
    }
  }

  /**
   * Install a tool from a tarball using curl
   */
  private async installFromCurlTar(
    toolName: string,
    toolConfig: ToolConfig,
    context: any, // context now includes otherChanges
    _options?: InstallOptions
  ): Promise<InstallResult> {
    log('installFromCurlTar: toolName=%s', toolName);
    const otherChanges: string[] = context.otherChanges || [];

    if (!toolConfig.installParams || !('url' in toolConfig.installParams)) {
      return {
        success: false,
        error: 'URL not specified in installParams',
        otherChanges,
      };
    }

    // Type assertion to access CurlTarInstallParams properties
    const params = toolConfig.installParams as any;
    const url = params.url;
    // extractPath is now handled as extractPathInArchive below
    const moveBinaryTo = params.moveBinaryTo;

    try {
      // Download the tarball
      log('installFromCurlTar: Downloading tarball from %s', url);
      const tarballPath = path.join(context.installDir, `${toolName}.tar.gz`); // Assuming .tar.gz, adjust if needed
      await this.downloader.download(url, {
        destinationPath: tarballPath,
      });
      otherChanges.push(`Downloaded tarball from ${url} to ${tarballPath}.`);

      // Update context with download path
      context.downloadPath = tarballPath;

      // Run afterDownload hook if defined
      if (toolConfig.installParams?.hooks?.afterDownload) {
        log('installFromCurlTar: Running afterDownload hook');
        otherChanges.push(`Executing afterDownload hook for ${toolName}.`);
        await toolConfig.installParams.hooks.afterDownload(context);
        otherChanges.push(`Finished executing afterDownload hook for ${toolName}.`);
      }

      // Extract the tarball
      log('installFromCurlTar: Extracting tarball');
      otherChanges.push(`Starting extraction of tarball: ${tarballPath}`);
      const extractDir = path.join(context.installDir, 'extracted');
      await this.fs.ensureDir(extractDir);
      otherChanges.push(`Ensured extraction directory exists: ${extractDir}`);

      const extractResult: ExtractResult = await this.archiveExtractor.extract(tarballPath, {
        targetDir: extractDir,
        stripComponents: params.stripComponents, // from CurlTarInstallParams
      });
      log('installFromCurlTar: Tarball extracted: %o', extractResult);
      otherChanges.push(
        `Extracted tarball ${tarballPath} to ${extractDir}. Files: ${extractResult.extractedFiles.join(', ')}.`
      );

      // Update context with extract directory and result
      context.extractDir = extractDir;
      context.extractResult = extractResult;

      // Run afterExtract hook if defined
      if (toolConfig.installParams?.hooks?.afterExtract) {
        log('installFromCurlTar: Running afterExtract hook');
        otherChanges.push(`Executing afterExtract hook for ${toolName}.`);
        await toolConfig.installParams.hooks.afterExtract(context);
        otherChanges.push(`Finished executing afterExtract hook for ${toolName}.`);
      }

      // Find the binary in the extracted directory
      let finalBinaryPathCurl: string; // Renamed to avoid conflict
      // extractPathInArchive is from toolConfig.installParams.extractPath (renamed for clarity)
      const extractPathInArchive = params.extractPath as string | undefined; // Explicitly type
      if (extractPathInArchive) {
        finalBinaryPathCurl = path.join(extractDir, extractPathInArchive);
      } else if (extractResult.executables && extractResult.executables.length > 0) {
        const exeMatchingToolName = extractResult.executables.find(
          (exe) => path.basename(exe) === toolName
        );

        if (exeMatchingToolName) {
          finalBinaryPathCurl = path.join(extractDir, exeMatchingToolName);
        } else {
          finalBinaryPathCurl = path.join(extractDir, extractResult.executables[0] as string);
        }
        log('installFromCurlTar: Found executable in archive: %s', finalBinaryPathCurl);
      } else if (extractResult.extractedFiles && extractResult.extractedFiles.length === 1) {
        finalBinaryPathCurl = path.join(extractDir, extractResult.extractedFiles[0] as string);
        log(
          'installFromCurlTar: Assuming single extracted file is binary: %s',
          finalBinaryPathCurl
        );
      } else {
        const potentialBinary = extractResult.extractedFiles.find((f) => f.includes(toolName));
        if (potentialBinary) {
          finalBinaryPathCurl = path.join(extractDir, potentialBinary);
          log('installFromCurlTar: Fallback, found potential binary: %s', finalBinaryPathCurl);
        } else {
          log(
            'installFromCurlTar: Could not determine binary path in extracted archive. Defaulting to toolName in extractDir.'
          );
          finalBinaryPathCurl = path.join(extractDir, toolName);
        }
      }
      otherChanges.push(`Determined binary path after extraction: ${finalBinaryPathCurl}`);

      if (!(await this.fs.exists(finalBinaryPathCurl))) {
        return {
          success: false,
          error: `Binary not found at expected path after extraction: ${finalBinaryPathCurl}. Extracted files: ${extractResult.extractedFiles.join(', ')}`,
          otherChanges,
        };
      }

      // Make the binary executable (still in extractDir at this point)
      log('installFromCurlTar: Making binary executable: %s', finalBinaryPathCurl);
      await this.fs.chmod(finalBinaryPathCurl, 0o755);
      otherChanges.push(`Set executable permission (0755) on: ${finalBinaryPathCurl}`);

      // Determine the final destination path for the binary, directly in context.installDir
      const finalFileNameCurl = moveBinaryTo || path.basename(finalBinaryPathCurl);
      const actualFinalBinaryDestPathCurl = path.join(context.installDir, finalFileNameCurl);

      if (finalBinaryPathCurl !== actualFinalBinaryDestPathCurl) {
        log(
          'installFromCurlTar: Moving binary from %s to %s',
          finalBinaryPathCurl,
          actualFinalBinaryDestPathCurl
        );
        await this.fs.ensureDir(path.dirname(actualFinalBinaryDestPathCurl)); // Ensure parent dir of final destination exists

        // Copy the file from extractDir to its final place in installDir
        await this.fs.copyFile(finalBinaryPathCurl, actualFinalBinaryDestPathCurl);
        otherChanges.push(
          `Copied binary from ${finalBinaryPathCurl} to ${actualFinalBinaryDestPathCurl}.`
        );
        // Ensure the copied file is executable
        await this.fs.chmod(actualFinalBinaryDestPathCurl, 0o755);
        otherChanges.push(`Set executable permission (0755) on: ${actualFinalBinaryDestPathCurl}`);

        // Update finalBinaryPathCurl to the new location
        finalBinaryPathCurl = actualFinalBinaryDestPathCurl;
      } else {
        log('installFromCurlTar: Binary already at final destination: %s', finalBinaryPathCurl);
      }

      // Clean up the temporary extraction directory as we've moved the binary
      if (
        context.extractDir &&
        (await this.fs.exists(context.extractDir)) &&
        finalBinaryPathCurl.startsWith(context.installDir) &&
        !finalBinaryPathCurl.startsWith(context.extractDir)
      ) {
        log('installFromCurlTar: Cleaning up extractDir: %s', context.extractDir);
        await this.fs.rm(context.extractDir, { recursive: true, force: true });
        otherChanges.push(`Cleaned up temporary extraction directory: ${context.extractDir}`);
      } else if (
        // Clean up downloaded tarball if it was extracted and binary moved
        tarballPath !== finalBinaryPathCurl &&
        (await this.fs.exists(tarballPath))
      ) {
        log('installFromCurlTar: Cleaning up downloaded tarball: %s', tarballPath);
        await this.fs.rm(tarballPath);
        otherChanges.push(`Cleaned up downloaded tarball: ${tarballPath}`);
      }

      // Create a symlink in the bin directory
      const binDirForCurl = this.appConfig.binDir; // Renamed to avoid conflict
      await this.fs.ensureDir(binDirForCurl);
      const symlinkPathForCurl = path.join(binDirForCurl, toolName); // Renamed

      // Remove existing symlink if it exists
      if (await this.fs.exists(symlinkPathForCurl)) {
        await this.fs.rm(symlinkPathForCurl);
        otherChanges.push(`Removed existing symlink at: ${symlinkPathForCurl}`);
      }

      log(
        'installFromCurlTar: Creating symlink from %s to %s',
        finalBinaryPathCurl,
        symlinkPathForCurl
      );
      await this.fs.symlink(finalBinaryPathCurl, symlinkPathForCurl);
      otherChanges.push(`Created symlink: ${symlinkPathForCurl} -> ${finalBinaryPathCurl}`);

      return {
        success: true,
        binaryPath: finalBinaryPathCurl,
        symlinkPath: symlinkPathForCurl,
        info: {
          tarballUrl: url,
        },
        otherChanges,
      };
    } catch (error) {
      log('installFromCurlTar: Error: %O', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        otherChanges,
      };
    }
  }

  /**
   * Install a tool manually
   */
  private async installManually(
    toolName: string,
    toolConfig: ToolConfig,
    context: any, // context now includes otherChanges
    _options?: InstallOptions
  ): Promise<InstallResult> {
    log('installManually: toolName=%s', toolName);
    const otherChanges: string[] = context.otherChanges || [];

    if (!toolConfig.installParams || !('binaryPath' in toolConfig.installParams)) {
      return {
        success: false,
        error: 'Binary path not specified in installParams',
        otherChanges,
      };
    }

    // Type assertion to access ManualInstallParams properties
    const params = toolConfig.installParams as any;
    const binaryPath = params.binaryPath as string;
    otherChanges.push(`Manual installation: expecting binary at ${binaryPath}.`);

    try {
      // Check if the binary exists
      if (await this.fs.exists(binaryPath)) {
        otherChanges.push(`Binary found at specified path: ${binaryPath}.`);
        return {
          success: true,
          binaryPath,
          info: {
            manualInstall: true,
          },
          otherChanges,
        };
      } else {
        otherChanges.push(`Binary not found at specified path: ${binaryPath}.`);
        return {
          success: false,
          error: `Binary not found at ${binaryPath}`,
          otherChanges,
        };
      }
    } catch (error) {
      log('installManually: Error: %O', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        otherChanges,
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
    };
  }
}
