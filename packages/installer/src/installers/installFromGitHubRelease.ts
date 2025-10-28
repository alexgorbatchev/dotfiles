import path from 'node:path';
import { selectBestMatch } from '@dotfiles/arch';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { YamlConfig } from '@dotfiles/config';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import type {
  AssetSelectionContext,
  BaseInstallContext,
  ExtractResult,
  GitHubRelease,
  GitHubReleaseAsset,
  GithubReleaseInstallParams,
  GithubReleaseToolConfig,
  PostDownloadInstallContext,
  PostExtractInstallContext,
  SystemInfo,
} from '@dotfiles/schemas';
import { minimatch } from 'minimatch';
import type { InstallOptions, InstallResult } from '../types';
import {
  downloadWithProgress,
  executeAfterDownloadHook as executeAfterDownloadHookUtil,
  executeAfterExtractHook as executeAfterExtractHookUtil,
  getBinaryPaths,
} from '../utils';
import { setupBinariesFromArchive, setupBinariesFromDirectDownload } from '../utils/BinarySetupService';
import type { HookExecutor } from '../utils/HookExecutor';
import { messages } from '../utils/log-messages';

/**
 * Install a tool from GitHub releases
 */
export async function installFromGitHubRelease(
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  toolFs: IFileSystem,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient,
  archiveExtractor: IArchiveExtractor,
  appConfig: YamlConfig,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromGitHubRelease' });
  logger.debug(messages.lifecycle.methodStarted(toolName));

  if (!toolConfig.installParams || !('repo' in toolConfig.installParams)) {
    return {
      success: false,
      error: 'GitHub repository not specified in installParams',
    };
  }

  const params = toolConfig.installParams;
  const repo = params.repo;
  const version = params.version || 'latest';

  try {
    const release = await fetchGitHubRelease(repo, version, githubApiClient, logger);
    if (!release.success) {
      return release;
    }

    const asset = await selectAsset(release.data, params, context, logger);
    if (!asset.success) {
      return asset;
    }

    const downloadUrl = constructDownloadUrl(asset.data.browser_download_url, appConfig, logger);
    if (!downloadUrl.success) {
      return downloadUrl;
    }

    const downloadResult = await downloadAsset(downloadUrl.data, asset.data, context, downloader, options, logger);
    if (!downloadResult.success) {
      return downloadResult;
    }

    const postDownloadContext = {
      ...context,
      downloadPath: downloadResult.data.downloadPath,
    };

    const hookResult = await executeAfterDownloadHook(toolConfig, postDownloadContext, hookExecutor, toolFs, logger);
    if (!hookResult.success) {
      return hookResult;
    }

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
      logger
    );
    if (!installResult.success) {
      return installResult;
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      version: release.data.tag_name,
      info: {
        releaseUrl: release.data.html_url,
        publishedAt: release.data.published_at,
        releaseName: release.data.name,
        downloadUrl: downloadUrl.data,
        assetName: asset.data.name,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type OperationResult<T> = { success: true; data: T } | { success: false; error: string };

async function fetchGitHubRelease(
  repo: string,
  version: string,
  githubApiClient: IGitHubApiClient,
  logger: TsLogger
): Promise<OperationResult<GitHubRelease>> {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    return {
      success: false,
      error: `Invalid GitHub repository format: ${repo}. Expected format: owner/repo`,
    };
  }

  let release: GitHubRelease | null;
  if (version === 'latest') {
    logger.debug(messages.gitHubRelease.fetchLatest(repo));
    release = await githubApiClient.getLatestRelease(owner, repoName);
  } else {
    logger.debug(messages.gitHubRelease.fetchByTag(version, repo));
    release = await githubApiClient.getReleaseByTag(owner, repoName, version);
  }

  if (!release) {
    return {
      success: false,
      error: `Failed to fetch release information for ${repo}`,
    };
  }

  return { success: true, data: release };
}

async function selectAsset(
  release: GitHubRelease,
  params: GithubReleaseInstallParams,
  context: BaseInstallContext,
  logger: TsLogger
): Promise<OperationResult<GitHubReleaseAsset>> {
  let asset: GitHubReleaseAsset | undefined;

  if (params.assetSelector) {
    logger.debug(messages.gitHubRelease.assetSelectorCustom());
    const selectionContext: AssetSelectionContext = {
      ...context,
      assets: release.assets,
      release,
      assetPattern: params.assetPattern,
    };
    asset = params.assetSelector(selectionContext);
  } else if (params.assetPattern) {
    logger.debug(messages.gitHubRelease.assetPatternMatch(params.assetPattern));
    const pattern = params.assetPattern;
    asset = release.assets.find((a) => minimatch(a.name, pattern));
  } else {
    logger.debug(messages.gitHubRelease.assetPlatformMatch(context.systemInfo.platform, context.systemInfo.arch));
    asset = findPlatformAsset(release.assets, context.systemInfo);
  }

  if (!asset) {
    return {
      success: false,
      error: createAssetNotFoundError(release, params, context),
    };
  }

  return { success: true, data: asset };
}

function findPlatformAsset(assets: GitHubReleaseAsset[], systemInfo: SystemInfo): GitHubReleaseAsset | undefined {
  const assetNames = assets.map((a) => a.name);
  const selectedName = selectBestMatch(assetNames, systemInfo);

  if (!selectedName) {
    return undefined;
  }

  return assets.find((a) => a.name === selectedName);
}

function createAssetNotFoundError(
  release: GitHubRelease,
  params: GithubReleaseInstallParams,
  context: BaseInstallContext
): string {
  const availableAssetNames = release.assets.map((a) => a.name);
  const platform = context.systemInfo.platform.toLowerCase();
  const arch = context.systemInfo.arch.toLowerCase();
  let searchedForMessage = '';

  if (params.assetSelector) {
    searchedForMessage = `using a custom assetSelector function for ${platform}/${arch}.`;
  } else if (params.assetPattern) {
    searchedForMessage = `for asset pattern: "${params.assetPattern}" for ${platform}/${arch}.`;
  } else {
    searchedForMessage = `for platform "${platform}" and architecture "${arch}".`;
  }

  const errorLines = [
    `No suitable asset found in release "${release.tag_name}" ${searchedForMessage}`,
    `Available assets in release "${release.tag_name}":`,
    ...availableAssetNames.map((name) => `  - ${name}`),
  ];

  return errorLines.join('\n');
}

function constructDownloadUrl(
  rawBrowserDownloadUrl: string,
  appConfig: YamlConfig,
  logger: TsLogger
): OperationResult<string> {
  const customHost = appConfig.github.host;
  const host = customHost ?? '(public GitHub)';
  logger.debug(messages.gitHubRelease.determiningDownloadUrl(rawBrowserDownloadUrl, customHost));

  try {
    const isAbsolute = isAbsoluteUrl(rawBrowserDownloadUrl);
    const downloadUrl = isAbsolute
      ? handleAbsoluteUrl(rawBrowserDownloadUrl, logger)
      : handleRelativeUrl(rawBrowserDownloadUrl, customHost, logger);

    if (!downloadUrl.success) {
      return downloadUrl;
    }

    logger.debug(messages.gitHubRelease.finalDownloadUrl(rawBrowserDownloadUrl, host, downloadUrl.data));

    return downloadUrl;
  } catch (error) {
    logger.error(messages.gitHubRelease.invalidUrl(rawBrowserDownloadUrl));
    logger.debug(messages.gitHubRelease.downloadUrlError(rawBrowserDownloadUrl, host), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
  logger.debug(messages.gitHubRelease.usingAbsoluteUrl(url));
  return { success: true, data: url };
}

function handleRelativeUrl(rawUrl: string, customHost: string | undefined, logger: TsLogger): OperationResult<string> {
  if (!rawUrl.startsWith('/')) {
    logger.debug(messages.gitHubRelease.invalidRelativeUrl(rawUrl));
    return {
      success: false,
      error: `Invalid asset download URL format: ${rawUrl}`,
    };
  }

  let base = customHost && !customHost.includes('api.github.com') ? customHost : 'https://github.com';
  if (!/^https?:\/\//.test(base)) {
    base = `https:${base.startsWith('//') ? '' : '//'}${base}`;
  }
  const finalUrl = new URL(rawUrl, base);
  const downloadUrl = finalUrl.toString();
  logger.debug(messages.gitHubRelease.resolvedRelativeUrl(base, rawUrl, downloadUrl));
  return { success: true, data: downloadUrl };
}

async function downloadAsset(
  downloadUrl: string,
  asset: GitHubReleaseAsset,
  context: BaseInstallContext,
  downloader: IDownloader,
  options: InstallOptions | undefined,
  logger: TsLogger
): Promise<OperationResult<{ downloadPath: string }>> {
  logger.debug(messages.gitHubRelease.downloadingAsset(downloadUrl));
  const downloadPath = path.join(context.installDir, asset.name);

  try {
    await downloadWithProgress(downloadUrl, downloadPath, asset.name, downloader, options);
    return { success: true, data: { downloadPath } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeAfterDownloadHook(
  toolConfig: GithubReleaseToolConfig,
  postDownloadContext: PostDownloadInstallContext,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
): Promise<OperationResult<void>> {
  const result = await executeAfterDownloadHookUtil(toolConfig, postDownloadContext, hookExecutor, fs, logger);
  return result.success
    ? { success: true, data: undefined }
    : { success: false, error: result.error || 'Hook execution failed' };
}

function isArchiveFile(filename: string): boolean {
  return (
    filename.endsWith('.tar.gz') || filename.endsWith('.tgz') || filename.endsWith('.zip') || filename.endsWith('.tar')
  );
}

async function processAssetInstallation(
  asset: GitHubReleaseAsset,
  downloadPath: string,
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: BaseInstallContext,
  postDownloadContext: PostDownloadInstallContext,
  toolFs: IFileSystem,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
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
      logger
    );
  } else {
    await setupBinariesFromDirectDownload(toolFs, toolName, toolConfig, context, downloadPath, logger);
    return { success: true, data: undefined };
  }
}

async function processArchiveInstallation(
  asset: GitHubReleaseAsset,
  downloadPath: string,
  toolName: string,
  toolConfig: GithubReleaseToolConfig,
  context: BaseInstallContext,
  postDownloadContext: PostDownloadInstallContext,
  toolFs: IFileSystem,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger
): Promise<OperationResult<void>> {
  logger.debug(messages.gitHubRelease.extractingArchive(asset.name));

  const extractResult: ExtractResult = await archiveExtractor.extract(downloadPath, {
    targetDir: context.installDir,
  });
  logger.debug(messages.gitHubRelease.archiveExtracted(), extractResult);

  const postExtractContext = {
    ...postDownloadContext,
    extractDir: context.installDir,
    extractResult,
  };

  const hookResult = await executeAfterExtractHook(toolConfig, postExtractContext, fs, hookExecutor, logger);
  if (!hookResult.success) {
    return hookResult;
  }

  await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, context.installDir, logger);

  if (await toolFs.exists(downloadPath)) {
    logger.debug(messages.gitHubRelease.cleaningArchive(downloadPath));
    await toolFs.rm(downloadPath);
  }

  return { success: true, data: undefined };
}

async function executeAfterExtractHook(
  toolConfig: GithubReleaseToolConfig,
  postExtractContext: PostExtractInstallContext,
  fs: IFileSystem,
  hookExecutor: HookExecutor,
  logger: TsLogger
): Promise<OperationResult<void>> {
  const result = await executeAfterExtractHookUtil(toolConfig, postExtractContext, hookExecutor, fs, logger);
  return result.success
    ? { success: true, data: undefined }
    : { success: false, error: result.error || 'Hook execution failed' };
}
