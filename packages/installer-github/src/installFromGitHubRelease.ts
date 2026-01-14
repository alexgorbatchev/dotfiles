import { selectBestMatch } from '@dotfiles/arch';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { ProjectConfig } from '@dotfiles/config';
import type {
  IDownloadContext,
  IExtractContext,
  IExtractResult,
  IGitHubRelease,
  IGitHubReleaseAsset,
  IInstallContext,
  ISystemInfo,
} from '@dotfiles/core';
import { architectureToString, platformToString } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, IInstallOptions } from '@dotfiles/installer';
import {
  downloadWithProgress,
  executeAfterDownloadHook as executeAfterDownloadHookUtil,
  executeAfterExtractHook as executeAfterExtractHookUtil,
  getBinaryPaths,
  setupBinariesFromArchive,
  setupBinariesFromDirectDownload,
} from '@dotfiles/installer';
import type {
  GithubReleaseInstallParams,
  GithubReleaseToolConfig,
  IAssetSelectionContext,
} from '@dotfiles/installer-github';
import type { TsLogger } from '@dotfiles/logger';
import { normalizeVersion } from '@dotfiles/utils';
import path from 'node:path';
import type { IGitHubApiClient } from './github-client';
import { messages } from './log-messages';
import { type AssetPattern, formatAssetPatternForLog, matchAssetPattern } from './matchAssetPattern';
import type { GitHubReleaseInstallResult, IGitHubReleaseInstallMetadata } from './types';

/**
 * Install a tool from GitHub releases
 */
export async function installFromGitHubRelease(
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  toolFs: IFileSystem,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient,
  archiveExtractor: IArchiveExtractor,
  projectConfig: ProjectConfig,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
): Promise<GitHubReleaseInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromGitHubRelease' });
  logger.debug(messages.startingInstallation(toolName));

  if (!toolConfig.installParams || !('repo' in toolConfig.installParams)) {
    const result: GitHubReleaseInstallResult = {
      success: false,
      error: 'GitHub repository not specified in installParams',
    };
    return result;
  }

  const params = toolConfig.installParams;
  const repo = params.repo;
  const version = params.version || 'latest';

  try {
    const release = await fetchGitHubRelease(repo, version, githubApiClient, logger);
    if (!release.success) {
      const result: GitHubReleaseInstallResult = release;
      return result;
    }

    const asset = await selectAsset(release.data, params, context, logger);
    if (!asset.success) {
      const result: GitHubReleaseInstallResult = asset;
      return result;
    }

    const downloadUrl = constructDownloadUrl(asset.data.browser_download_url, projectConfig, logger);
    if (!downloadUrl.success) {
      const result: GitHubReleaseInstallResult = downloadUrl;
      return result;
    }

    const downloadResult = await downloadAsset(downloadUrl.data, asset.data, context, downloader, options, logger);
    if (!downloadResult.success) {
      const result: GitHubReleaseInstallResult = downloadResult;
      return result;
    }

    const postDownloadContext: IDownloadContext = {
      ...context,
      downloadPath: downloadResult.data.downloadPath,
    };

    const hookResult = await executeAfterDownloadHook(toolConfig, postDownloadContext, hookExecutor, toolFs, logger);
    if (!hookResult.success) {
      const result: GitHubReleaseInstallResult = hookResult;
      return result;
    }

    const resolvedVersion = normalizeVersion(release.data.tag_name);

    const installResult = await processAssetInstallation(
      asset.data,
      downloadResult.data.downloadPath,
      toolName,
      toolConfig,
      context,
      postDownloadContext,
      toolFs,
      archiveExtractor,
      hookExecutor,
      toolFs,
      logger,
    );
    if (!installResult.success) {
      const result: GitHubReleaseInstallResult = installResult;
      return result;
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.stagingDir);

    const metadata: IGitHubReleaseInstallMetadata = {
      method: 'github-release',
      releaseUrl: release.data.html_url,
      publishedAt: release.data.published_at,
      releaseName: release.data.name,
      downloadUrl: downloadUrl.data,
      assetName: asset.data.name,
    };

    const result: GitHubReleaseInstallResult = {
      success: true,
      binaryPaths,
      version: resolvedVersion,
      originalTag: release.data.tag_name,
      metadata,
    };
    return result;
  } catch (error) {
    const result: GitHubReleaseInstallResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return result;
  }
}

type OperationResult<T> = { success: true; data: T; } | { success: false; error: string; };

interface IDownloadAssetResultData {
  downloadPath: string;
}

const TAG_SUGGESTIONS_COUNT = 5;

export async function fetchGitHubRelease(
  repo: string,
  version: string,
  githubApiClient: IGitHubApiClient,
  parentLogger: TsLogger,
): Promise<OperationResult<IGitHubRelease>> {
  const logger = parentLogger.getSubLogger({ name: 'fetchGitHubRelease' });
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    const result: OperationResult<IGitHubRelease> = {
      success: false,
      error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
    };
    return result;
  }

  // Handle 'latest' version request
  if (version === 'latest') {
    logger.debug(messages.fetchLatest(repo));
    const release = await githubApiClient.getLatestRelease(owner, repoName);
    if (!release) {
      const result: OperationResult<IGitHubRelease> = {
        success: false,
        error: `Failed to fetch latest release for ${repo}`,
      };
      return result;
    }
    const result: OperationResult<IGitHubRelease> = { success: true, data: release };
    return result;
  }

  // Try fetching with the exact version provided
  logger.debug(messages.fetchByTag(version, repo));
  const release = await githubApiClient.getReleaseByTag(owner, repoName, version);
  if (release) {
    const result: OperationResult<IGitHubRelease> = { success: true, data: release };
    return result;
  }

  // First attempt failed - try to detect the tag pattern
  const releaseWithCorrectedTag = await fetchWithTagPatternDetection(owner, repoName, version, githubApiClient, logger);
  if (releaseWithCorrectedTag) {
    const result: OperationResult<IGitHubRelease> = { success: true, data: releaseWithCorrectedTag };
    return result;
  }

  // All attempts failed - show available tags to help the user
  await showAvailableReleaseTags(owner, repoName, githubApiClient, logger);

  const result: OperationResult<IGitHubRelease> = {
    success: false,
    error: `Release '${version}' not found for ${repo}. Check the available tags above.`,
  };
  return result;
}

async function fetchWithTagPatternDetection(
  owner: string,
  repoName: string,
  version: string,
  githubApiClient: IGitHubApiClient,
  parentLogger: TsLogger,
): Promise<IGitHubRelease | null> {
  const logger = parentLogger.getSubLogger({ name: 'fetchWithTagPatternDetection' });
  // Import utilities from github-client
  const { buildCorrectedTag } = await import('./github-client');

  // Probe the latest release to detect the tag pattern
  logger.debug(messages.detectingTagPattern());
  const latestTag = await githubApiClient.probeLatestTag(owner, repoName);

  if (!latestTag) {
    logger.debug(messages.tagPatternDetectionFailed());
    return null;
  }

  // Build corrected tag using detected pattern
  const correctedTag = buildCorrectedTag(latestTag, version);

  // If the corrected tag is different, try fetching with it
  if (correctedTag !== version) {
    logger.debug(messages.tryingCorrectedTag(correctedTag, version));
    const release = await githubApiClient.getReleaseByTag(owner, repoName, correctedTag);
    if (release) {
      logger.info(messages.usingCorrectedTag(correctedTag, version));
      return release;
    }
  }

  return null;
}

async function showAvailableReleaseTags(
  owner: string,
  repoName: string,
  githubApiClient: IGitHubApiClient,
  parentLogger: TsLogger,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'showAvailableReleaseTags' });
  const tags = await githubApiClient.getLatestReleaseTags(owner, repoName, TAG_SUGGESTIONS_COUNT);

  if (tags.length === 0) {
    logger.error(messages.noReleaseTagsAvailable());
    return;
  }

  logger.info(messages.availableReleaseTags());
  for (const tag of tags) {
    logger.info(messages.releaseTagItem(tag));
  }
}

async function selectAsset(
  release: IGitHubRelease,
  params: GithubReleaseInstallParams,
  context: IInstallContext,
  logger: TsLogger,
): Promise<OperationResult<IGitHubReleaseAsset>> {
  let asset: IGitHubReleaseAsset | undefined;

  if (params.assetSelector) {
    logger.debug(messages.assetSelectorCustom());
    const selectionContext: IAssetSelectionContext = {
      ...context,
      assets: release.assets,
      release,
      assetPattern: params.assetPattern,
    };
    asset = params.assetSelector(selectionContext);
  } else if (params.assetPattern) {
    logger.debug(messages.assetPatternMatch(formatAssetPatternForLog(params.assetPattern)));
    const pattern: AssetPattern = params.assetPattern;
    asset = release.assets.find((a) => matchAssetPattern(a.name, pattern));
  } else {
    logger.debug(
      messages.assetPlatformMatch(
        platformToString(context.systemInfo.platform),
        architectureToString(context.systemInfo.arch),
      ),
    );
    asset = findPlatformAsset(release.assets, context.systemInfo);
  }

  if (!asset) {
    const result: OperationResult<IGitHubReleaseAsset> = {
      success: false,
      error: createAssetNotFoundError(release, params, context),
    };
    return result;
  }

  const result: OperationResult<IGitHubReleaseAsset> = { success: true, data: asset };
  return result;
}

function findPlatformAsset(assets: IGitHubReleaseAsset[], systemInfo: ISystemInfo): IGitHubReleaseAsset | undefined {
  const assetNames = assets.map((a) => a.name);
  const selectedName = selectBestMatch(assetNames, systemInfo);

  if (!selectedName) {
    return undefined;
  }

  return assets.find((a) => a.name === selectedName);
}

function createAssetNotFoundError(
  release: IGitHubRelease,
  params: GithubReleaseInstallParams,
  context: IInstallContext,
): string {
  const availableAssetNames = release.assets.map((a) => a.name);
  const platform = platformToString(context.systemInfo.platform);
  const arch = architectureToString(context.systemInfo.arch);
  let searchedForMessage = '';

  if (params.assetSelector) {
    searchedForMessage = `using a custom assetSelector function for ${platform}/${arch}.`;
  } else if (params.assetPattern) {
    searchedForMessage = `for asset pattern: "${params.assetPattern}" for ${platform}/${arch}.`;
  } else {
    searchedForMessage = `for platform "${platform}" and architecture "${arch}".`;
  }

  const errorLines: string[] = [
    `No suitable asset found in release "${release.tag_name}" ${searchedForMessage}`,
    `Available assets in release "${release.tag_name}":`,
    ...availableAssetNames.map((name) => `  - ${name}`),
  ];

  return errorLines.join('\n');
}

function constructDownloadUrl(
  rawBrowserDownloadUrl: string,
  projectConfig: ProjectConfig,
  logger: TsLogger,
): OperationResult<string> {
  const customHost = projectConfig.github.host;
  const hasCustomHost = Boolean(customHost);
  logger.debug(messages.determiningDownloadUrl(rawBrowserDownloadUrl, hasCustomHost));

  try {
    const isAbsolute = isAbsoluteUrl(rawBrowserDownloadUrl);
    const downloadUrl = isAbsolute
      ? handleAbsoluteUrl(rawBrowserDownloadUrl, logger)
      : handleRelativeUrl(rawBrowserDownloadUrl, customHost, logger);

    if (!downloadUrl.success) {
      return downloadUrl;
    }

    logger.debug(messages.finalDownloadUrl(rawBrowserDownloadUrl, downloadUrl.data, hasCustomHost));

    return downloadUrl;
  } catch (error) {
    logger.error(messages.invalidUrl(rawBrowserDownloadUrl));
    logger.debug(messages.downloadUrlError(rawBrowserDownloadUrl, hasCustomHost), error);
    const result: OperationResult<string> = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return result;
  }
}

function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function handleAbsoluteUrl(url: string, logger: TsLogger): OperationResult<string> {
  logger.debug(messages.usingAbsoluteUrl(url));
  const result: OperationResult<string> = { success: true, data: url };
  return result;
}

function handleRelativeUrl(rawUrl: string, customHost: string | undefined, logger: TsLogger): OperationResult<string> {
  if (!rawUrl.startsWith('/')) {
    logger.debug(messages.invalidRelativeUrl(rawUrl));
    const result: OperationResult<string> = {
      success: false,
      error: `Invalid asset download URL format: ${rawUrl}`,
    };
    return result;
  }

  let base = customHost && !customHost.includes('api.github.com') ? customHost : 'https://github.com';
  if (!/^https?:\/\//.test(base)) {
    base = `https:${base.startsWith('//') ? '' : '//'}${base}`;
  }
  const finalUrl = new URL(rawUrl, base);
  const downloadUrl = finalUrl.toString();
  logger.debug(messages.resolvedRelativeUrl(base, rawUrl, downloadUrl));
  const result: OperationResult<string> = { success: true, data: downloadUrl };
  return result;
}

async function downloadAsset(
  downloadUrl: string,
  asset: IGitHubReleaseAsset,
  context: IInstallContext,
  downloader: IDownloader,
  options: IInstallOptions | undefined,
  logger: TsLogger,
): Promise<OperationResult<IDownloadAssetResultData>> {
  logger.debug(messages.downloadingAsset(downloadUrl));
  const downloadPath = path.join(context.stagingDir, asset.name);

  try {
    await downloadWithProgress(logger, downloadUrl, downloadPath, asset.name, downloader, options);
    const data: IDownloadAssetResultData = { downloadPath };
    const result: OperationResult<IDownloadAssetResultData> = { success: true, data };
    return result;
  } catch (error) {
    const result: OperationResult<IDownloadAssetResultData> = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return result;
  }
}

async function executeAfterDownloadHook(
  toolConfig: GithubReleaseToolConfig,
  postDownloadContext: IDownloadContext,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<OperationResult<void>> {
  const result = await executeAfterDownloadHookUtil(toolConfig, postDownloadContext, hookExecutor, fs, logger);
  if (result.success) {
    const finalResult: OperationResult<void> = { success: true, data: undefined };
    return finalResult;
  }

  const finalResult: OperationResult<void> = { success: false, error: result.error || 'Hook execution failed' };
  return finalResult;
}

function isArchiveFile(filename: string): boolean {
  return (
    filename.endsWith('.tar.gz') || filename.endsWith('.tgz') || filename.endsWith('.zip') || filename.endsWith('.tar')
  );
}

async function processAssetInstallation(
  asset: IGitHubReleaseAsset,
  downloadPath: string,
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: IInstallContext,
  postDownloadContext: IDownloadContext,
  toolFs: IFileSystem,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<OperationResult<void>> {
  if (isArchiveFile(asset.name)) {
    return await processArchiveInstallation(
      asset,
      downloadPath,
      toolName,
      toolConfig,
      context,
      postDownloadContext,
      toolFs,
      archiveExtractor,
      hookExecutor,
      fs,
      logger,
    );
  } else {
    await setupBinariesFromDirectDownload(toolFs, toolName, toolConfig, context, downloadPath, logger);
    const result: OperationResult<void> = { success: true, data: undefined };
    return result;
  }
}

async function processArchiveInstallation(
  asset: IGitHubReleaseAsset,
  downloadPath: string,
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: IInstallContext,
  postDownloadContext: IDownloadContext,
  toolFs: IFileSystem,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<OperationResult<void>> {
  logger.debug(messages.extractingArchive(asset.name));

  const extractResult: IExtractResult = await archiveExtractor.extract(logger, downloadPath, {
    targetDir: context.stagingDir,
  });
  logger.debug(messages.archiveExtracted(extractResult.extractedFiles.length, extractResult.executables.length));

  const postExtractContext: IExtractContext = {
    ...postDownloadContext,
    extractDir: context.stagingDir,
    extractResult,
  };

  const hookResult = await executeAfterExtractHook(toolConfig, postExtractContext, fs, hookExecutor, logger);
  if (!hookResult.success) {
    return hookResult;
  }

  await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, context.stagingDir, logger);

  if (await toolFs.exists(downloadPath)) {
    logger.debug(messages.cleaningArchive(downloadPath));
    await toolFs.rm(downloadPath);
  }

  const result: OperationResult<void> = { success: true, data: undefined };
  return result;
}

async function executeAfterExtractHook(
  toolConfig: GithubReleaseToolConfig,
  postExtractContext: IExtractContext,
  fs: IFileSystem,
  hookExecutor: HookExecutor,
  logger: TsLogger,
): Promise<OperationResult<void>> {
  const result = await executeAfterExtractHookUtil(toolConfig, postExtractContext, hookExecutor, fs, logger);
  if (result.success) {
    const finalResult: OperationResult<void> = { success: true, data: undefined };
    return finalResult;
  }

  const finalResult: OperationResult<void> = { success: false, error: result.error || 'Hook execution failed' };
  return finalResult;
}
