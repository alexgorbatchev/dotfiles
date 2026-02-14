import { selectBestMatch } from '@dotfiles/arch';
import { type IArchiveExtractor, isSupportedArchiveFile } from '@dotfiles/archive-extractor';
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
import type { TsLogger } from '@dotfiles/logger';
import { normalizeVersion } from '@dotfiles/utils';
import path from 'node:path';
import type { IGiteaApiClient } from './gitea-client';
import { messages } from './log-messages';
import { type AssetPattern, formatAssetPatternForLog, matchAssetPattern } from './matchAssetPattern';
import type {
  GiteaReleaseInstallParams,
  GiteaReleaseToolConfig,
  IGiteaAssetSelectionContext,
} from './schemas';
import type { GiteaReleaseInstallResult, IGiteaReleaseInstallMetadata } from './types';

type OperationResult<T> = { success: true; data: T; } | { success: false; error: string; };

interface IDownloadAssetResultData {
  downloadPath: string;
}

const TAG_SUGGESTIONS_COUNT = 5;

export async function installFromGiteaRelease(
  toolName: string,
  toolConfig: GiteaReleaseToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  toolFs: IFileSystem,
  downloader: IDownloader,
  giteaApiClient: IGiteaApiClient,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
): Promise<GiteaReleaseInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromGiteaRelease' });
  logger.debug(messages.startingInstallation(toolName));

  if (!toolConfig.installParams || !('repo' in toolConfig.installParams)) {
    const result: GiteaReleaseInstallResult = {
      success: false,
      error: 'Repository not specified in installParams',
    };
    return result;
  }

  const params = toolConfig.installParams;
  const repo = params.repo;
  const version = params.version || 'latest';

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    const result: GiteaReleaseInstallResult = {
      success: false,
      error: `Invalid repository format: ${repo}. Expected format: owner/repo`,
    };
    return result;
  }

  try {
    const release = await fetchGiteaRelease(repo, version, params.prerelease ?? false, giteaApiClient, logger);
    if (!release.success) {
      const result: GiteaReleaseInstallResult = release;
      return result;
    }

    const asset = selectAsset(release.data, params, context, logger);
    if (!asset.success) {
      const result: GiteaReleaseInstallResult = asset;
      return result;
    }

    const downloadUrl = asset.data.browser_download_url;
    const downloadPath = path.join(context.stagingDir, asset.data.name);

    const downloadResult = await downloadAsset(
      downloadUrl,
      asset.data,
      downloader,
      downloadPath,
      options,
      logger,
    );
    if (!downloadResult.success) {
      const result: GiteaReleaseInstallResult = downloadResult;
      return result;
    }

    const postDownloadContext: IDownloadContext = {
      ...context,
      downloadPath: downloadResult.data.downloadPath,
    };

    const hookResult = await executeAfterDownloadHook(toolConfig, postDownloadContext, hookExecutor, toolFs, logger);
    if (!hookResult.success) {
      const result: GiteaReleaseInstallResult = hookResult;
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
      const result: GiteaReleaseInstallResult = installResult;
      return result;
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.stagingDir);

    const metadata: IGiteaReleaseInstallMetadata = {
      method: 'gitea-release',
      releaseUrl: release.data.html_url,
      publishedAt: release.data.published_at,
      releaseName: release.data.name,
      instanceUrl: params.instanceUrl,
      downloadUrl,
      assetName: asset.data.name,
    };

    const result: GiteaReleaseInstallResult = {
      success: true,
      binaryPaths,
      version: resolvedVersion,
      originalTag: release.data.tag_name,
      metadata,
    };
    return result;
  } catch (error) {
    const result: GiteaReleaseInstallResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return result;
  }
}

export async function fetchGiteaRelease(
  repo: string,
  version: string,
  includePrerelease: boolean,
  giteaApiClient: IGiteaApiClient,
  parentLogger: TsLogger,
): Promise<OperationResult<IGitHubRelease>> {
  const logger = parentLogger.getSubLogger({ name: 'fetchGiteaRelease' });
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    const result: OperationResult<IGitHubRelease> = {
      success: false,
      error: `Invalid repository format: ${repo}. Expected format: owner/repo`,
    };
    return result;
  }

  if (version === 'latest') {
    logger.debug(messages.fetchLatest(repo));

    if (includePrerelease) {
      const releases = await giteaApiClient.getAllReleases(owner, repoName, {
        limit: 1,
        includePrerelease: true,
        maxResults: 1,
      });
      const firstRelease = releases[0];
      if (!firstRelease) {
        const result: OperationResult<IGitHubRelease> = {
          success: false,
          error: `Failed to fetch latest release for ${repo}`,
        };
        return result;
      }
      const result: OperationResult<IGitHubRelease> = { success: true, data: firstRelease };
      return result;
    }

    const release = await giteaApiClient.getLatestRelease(owner, repoName);
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

  logger.debug(messages.fetchByTag(version, repo));
  const release = await giteaApiClient.getReleaseByTag(owner, repoName, version);
  if (release) {
    const result: OperationResult<IGitHubRelease> = { success: true, data: release };
    return result;
  }

  await showAvailableReleaseTags(owner, repoName, giteaApiClient, logger);

  const result: OperationResult<IGitHubRelease> = {
    success: false,
    error: `Release '${version}' not found for ${repo}. Check the available tags above.`,
  };
  return result;
}

async function showAvailableReleaseTags(
  owner: string,
  repoName: string,
  giteaApiClient: IGiteaApiClient,
  parentLogger: TsLogger,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'showAvailableReleaseTags' });
  const tags = await giteaApiClient.getLatestReleaseTags(owner, repoName, TAG_SUGGESTIONS_COUNT);

  if (tags.length === 0) {
    logger.error(messages.noReleaseTagsAvailable());
    return;
  }

  logger.info(messages.availableReleaseTags());
  for (const tag of tags) {
    logger.info(messages.releaseTagItem(tag));
  }
}

export function selectAsset(
  release: IGitHubRelease,
  params: GiteaReleaseInstallParams,
  context: IInstallContext,
  logger: TsLogger,
): OperationResult<IGitHubReleaseAsset> {
  let asset: IGitHubReleaseAsset | undefined;

  if (params.assetSelector) {
    logger.debug(messages.assetSelectorCustom());
    const selectionContext: IGiteaAssetSelectionContext = {
      ...context,
      assets: release.assets,
      release,
      assetPattern: params.assetPattern,
    };
    asset = params.assetSelector(selectionContext);
  } else if (params.assetPattern) {
    logger.debug(messages.assetPatternMatch(formatAssetPatternForLog(params.assetPattern)));
    const pattern: AssetPattern = params.assetPattern;
    const matchingAssets = release.assets.filter((a) => matchAssetPattern(a.name, pattern));
    asset = findPlatformAsset(matchingAssets, context.systemInfo);
    if (!asset && matchingAssets.length > 0) {
      asset = matchingAssets[0];
    }
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
  params: GiteaReleaseInstallParams,
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

async function downloadAsset(
  downloadUrl: string,
  asset: IGitHubReleaseAsset,
  downloader: IDownloader,
  downloadPath: string,
  options: IInstallOptions | undefined,
  logger: TsLogger,
): Promise<OperationResult<IDownloadAssetResultData>> {
  logger.debug(messages.downloadingAsset(downloadUrl));
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
  toolConfig: GiteaReleaseToolConfig,
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

async function processAssetInstallation(
  asset: IGitHubReleaseAsset,
  downloadPath: string,
  toolName: string,
  toolConfig: GiteaReleaseToolConfig,
  context: IInstallContext,
  postDownloadContext: IDownloadContext,
  toolFs: IFileSystem,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<OperationResult<void>> {
  if (isSupportedArchiveFile(asset.name)) {
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
  }

  await setupBinariesFromDirectDownload(toolFs, toolName, toolConfig, context, downloadPath, logger);
  const result: OperationResult<void> = { success: true, data: undefined };
  return result;
}

async function processArchiveInstallation(
  asset: IGitHubReleaseAsset,
  downloadPath: string,
  toolName: string,
  toolConfig: GiteaReleaseToolConfig,
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
  toolConfig: GiteaReleaseToolConfig,
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
