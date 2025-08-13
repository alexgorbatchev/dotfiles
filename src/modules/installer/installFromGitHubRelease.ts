import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IDownloader } from '@modules/downloader/IDownloader';
import { ProgressBar, shouldShowProgress } from '@modules/downloader/ProgressBar';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type {
  BaseInstallContext,
  ExtractResult,
  GitHubRelease,
  GitHubReleaseAsset,
  GithubReleaseToolConfig,
  PostDownloadInstallContext,
  PostExtractInstallContext,
} from '@types';
import { setupBinariesFromArchive, setupBinariesFromDirectDownload } from './BinarySetupService';
import type { HookExecutor } from './HookExecutor';
import type { InstallOptions, InstallResult } from './IInstaller';

/**
 * Install a tool from GitHub releases
 */
export async function installFromGitHubRelease(
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient,
  archiveExtractor: IArchiveExtractor,
  appConfig: YamlConfig,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<InstallResult> {
  // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
  const toolFs = fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;

  const logger = parentLogger.getSubLogger({ name: 'installFromGitHubRelease' });
  logger.debug(logs.command.debug.methodStarted(), toolName);

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
    let release: GitHubRelease | null;
    if (version === 'latest') {
      logger.debug(logs.command.debug.gitHubReleaseLatest(), repo || toolName);
      const [owner, repoName] = (repo || '').split('/');
      if (!owner || !repoName) {
        return {
          success: false,
          error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
        };
      }
      release = await githubApiClient.getLatestRelease(owner, repoName);
    } else {
      logger.debug(logs.command.debug.gitHubReleaseDetails(), version, repo || toolName);
      const [owner, repoName] = (repo || '').split('/');
      if (!owner || !repoName) {
        return {
          success: false,
          error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
        };
      }
      release = await githubApiClient.getReleaseByTag(owner, repoName, version);
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
      logger.debug(logs.command.debug.assetSelectorCustom());
      asset = params.assetSelector(release.assets, context.systemInfo);
    } else if (assetPattern) {
      logger.debug(logs.command.debug.assetPatternMatch(), assetPattern);
      const regex = new RegExp(assetPattern || '');
      asset = release.assets.find((a) => regex.test(a.name));
    } else {
      // Try to find an asset that matches the current platform and architecture
      logger.debug(logs.command.debug.assetPlatformMatch());
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
        arch === 'x64' ? ['x64', 'amd64', 'x86_64'] : arch === 'arm64' ? ['arm64', 'aarch64'] : [arch];

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
    const customHost = appConfig.github.host;

    logger.debug(logs.command.debug.determiningDownloadUrl(), rawBrowserDownloadUrl, customHost);

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
        logger.debug(logs.command.debug.usingAbsoluteUrl(), downloadUrl);
      } else if (rawBrowserDownloadUrl.startsWith('/')) {
        // Case: rawBrowserDownloadUrl is a relative path (e.g., "/owner/repo/releases/download/v1.0.0/asset.tar.gz")
        // Resolve it against the customHost or the default GitHub host for assets.
        // Assets are typically on "github.com", not "api.github.com".
        let base = customHost && !customHost.includes('api.github.com') ? customHost : 'https://github.com';
        if (!/^https?:\/\//.test(base)) {
          base = `https:${base.startsWith('//') ? '' : '//'}${base}`;
        }
        const finalUrl = new URL(rawBrowserDownloadUrl, base);
        downloadUrl = finalUrl.toString();
        logger.debug(logs.command.debug.resolvedRelativeUrl(), base, rawBrowserDownloadUrl, downloadUrl);
      } else {
        // Invalid or unsupported URL format
        logger.debug(logs.command.debug.invalidUrlFormat(), rawBrowserDownloadUrl);
        return {
          success: false,
          error: `Invalid asset download URL format: ${rawBrowserDownloadUrl}`,
        };
      }

      logger.debug(
        logs.command.debug.finalDownloadUrl(),
        rawBrowserDownloadUrl,
        customHost || '(public GitHub)',
        downloadUrl
      );
    } catch (e) {
      logger.error(logs.service.error.network.invalidUrl(rawBrowserDownloadUrl));
      logger.debug(
        logs.command.debug.downloadUrlError(),
        rawBrowserDownloadUrl,
        customHost || '(public GitHub)',
        (e as Error).message
      );
      return {
        success: false,
        error: `Failed to construct valid download URL. Raw: ${rawBrowserDownloadUrl}, Configured Host: ${customHost || '(public GitHub)'}, Error: ${(e as Error).message}`,
      };
    }

    logger.debug(logs.command.debug.downloadingAsset(), downloadUrl);
    const downloadPath = path.join(context.installDir, asset.name);

    const showProgress = shouldShowProgress(options?.quiet);
    const progressBar = new ProgressBar(asset.name, { enabled: showProgress });

    try {
      await downloader.download(downloadUrl, {
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
      logger.debug(logs.installer.debug.runningAfterDownloadHook());

      const enhancedContext = hookExecutor.createEnhancedContext(postDownloadContext, fs, logger);

      const hookResult = await hookExecutor.executeHook(
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
    const isArchive =
      asset.name.endsWith('.tar.gz') ||
      asset.name.endsWith('.tgz') ||
      asset.name.endsWith('.zip') ||
      asset.name.endsWith('.tar');

    if (isArchive) {
      logger.debug(logs.installer.debug.extractingArchive(), asset.name);

      // Extract the archive to a temporary directory
      const tempExtractDir = path.join(context.installDir, 'temp-extract');
      await toolFs.ensureDir(tempExtractDir);

      const extractResult: ExtractResult = await archiveExtractor.extract(downloadPath, {
        targetDir: tempExtractDir,
        stripComponents: params.stripComponents, // from GithubReleaseInstallParams
      });
      logger.debug(logs.installer.debug.archiveExtracted(), extractResult);

      // Update context with extract directory and result
      postExtractContext = {
        ...postDownloadContext,
        extractDir: tempExtractDir,
        extractResult,
      };

      // Run afterExtract hook if defined
      if (toolConfig.installParams?.hooks?.afterExtract) {
        logger.debug(logs.installer.debug.runningAfterExtractHook());

        const enhancedContext = hookExecutor.createEnhancedContext(postExtractContext, fs, logger);

        const hookResult = await hookExecutor.executeHook(
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
      await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, tempExtractDir, logger, extractResult);

      // Clean up temp extract directory
      logger.debug(logs.installer.debug.cleaningExtractDir(), tempExtractDir);
      await toolFs.rm(tempExtractDir, { recursive: true, force: true });
    } else {
      // Handle direct binary download
      await setupBinariesFromDirectDownload(toolFs, toolName, toolConfig, context, downloadPath, logger);
    }

    logger.debug(logs.installer.debug.githubReleaseFinalDestination(), context.installDir);

    // Clean up downloaded archive if it was extracted
    if (
      (await toolFs.exists(downloadPath)) &&
      (asset.name.endsWith('.tar.gz') ||
        asset.name.endsWith('.tgz') ||
        asset.name.endsWith('.zip') ||
        asset.name.endsWith('.tar'))
    ) {
      logger.debug(logs.installer.debug.cleaningArchive(), downloadPath);
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
    logger.error(logs.tool.error.installFailed('github-release', toolName, (error as Error).message));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
