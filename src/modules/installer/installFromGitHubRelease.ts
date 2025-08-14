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
  GithubReleaseInstallParams,
  GithubReleaseToolConfig,
  PostDownloadInstallContext,
  PostExtractInstallContext,
  SystemInfo,
} from '@types';
import { minimatch } from 'minimatch';
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
  const toolFs = fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;
  const logger = parentLogger.getSubLogger({ name: 'installFromGitHubRelease' });
  logger.debug(logs.command.debug.methodStarted(), toolName);

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

    const hookResult = await executeAfterDownloadHook(toolConfig, postDownloadContext, fs, hookExecutor, logger);
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
      fs,
      logger
    );
    if (!installResult.success) {
      return installResult;
    }

    const primaryBinary = toolConfig.binaries?.[0] || toolName;
    const primaryBinaryPath = path.join(context.installDir, primaryBinary);

    return {
      success: true,
      binaryPath: primaryBinaryPath,
      version: release.data.tag_name,
      info: {
        releaseUrl: release.data.html_url,
        publishedAt: release.data.published_at,
        releaseName: release.data.name,
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
    logger.debug(logs.command.debug.gitHubReleaseLatest(), repo);
    release = await githubApiClient.getLatestRelease(owner, repoName);
  } else {
    logger.debug(logs.command.debug.gitHubReleaseDetails(), version, repo);
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
    logger.debug(logs.command.debug.assetSelectorCustom());
    asset = params.assetSelector(release.assets, context.systemInfo);
  } else if (params.assetPattern) {
    logger.debug(logs.command.debug.assetPatternMatch(), params.assetPattern);
    const pattern = params.assetPattern;
    asset = release.assets.find((a) => minimatch(a.name, pattern));
  } else {
    logger.debug(logs.command.debug.assetPlatformMatch());
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
  const platform = systemInfo.platform.toLowerCase();
  const arch = systemInfo.arch.toLowerCase();

  const platformPatterns =
    platform === 'darwin' ? ['darwin', 'macos', 'mac', 'osx'] : platform === 'win32' ? ['windows', 'win'] : ['linux'];

  const archPatterns = arch === 'x64' ? ['x64', 'amd64', 'x86_64'] : arch === 'arm64' ? ['arm64', 'aarch64'] : [arch];

  return assets.find((a) => {
    const name = a.name.toLowerCase();
    return (
      platformPatterns.some((p) => name.includes(p)) && archPatterns.some((archPattern) => name.includes(archPattern))
    );
  });
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
  logger.debug(logs.command.debug.determiningDownloadUrl(), rawBrowserDownloadUrl, customHost);

  try {
    const isAbsolute = isAbsoluteUrl(rawBrowserDownloadUrl);
    const downloadUrl = isAbsolute
      ? handleAbsoluteUrl(rawBrowserDownloadUrl, logger)
      : handleRelativeUrl(rawBrowserDownloadUrl, customHost, logger);

    if (!downloadUrl.success) {
      return downloadUrl;
    }

    logger.debug(
      logs.command.debug.finalDownloadUrl(),
      rawBrowserDownloadUrl,
      customHost || '(public GitHub)',
      downloadUrl.data
    );

    return downloadUrl;
  } catch (error) {
    logger.error(logs.service.error.network.invalidUrl(rawBrowserDownloadUrl));
    logger.debug(
      logs.command.debug.downloadUrlError(),
      rawBrowserDownloadUrl,
      customHost || '(public GitHub)',
      (error as Error).message
    );
    return {
      success: false,
      error: `Failed to construct valid download URL. Raw: ${rawBrowserDownloadUrl}, Configured Host: ${customHost || '(public GitHub)'}, Error: ${(error as Error).message}`,
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
  logger.debug(logs.command.debug.usingAbsoluteUrl(), url);
  return { success: true, data: url };
}

function handleRelativeUrl(rawUrl: string, customHost: string | undefined, logger: TsLogger): OperationResult<string> {
  if (!rawUrl.startsWith('/')) {
    logger.debug(logs.command.debug.invalidUrlFormat(), rawUrl);
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
  logger.debug(logs.command.debug.resolvedRelativeUrl(), base, rawUrl, downloadUrl);
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
  logger.debug(logs.command.debug.downloadingAsset(), downloadUrl);
  const downloadPath = path.join(context.installDir, asset.name);

  const showProgress = shouldShowProgress(options?.quiet);
  const progressBar = new ProgressBar(asset.name, { enabled: showProgress });

  try {
    await downloader.download(downloadUrl, {
      destinationPath: downloadPath,
      onProgress: progressBar.createCallback(),
    });
    return { success: true, data: { downloadPath } };
  } catch (error) {
    return {
      success: false,
      error: `Download failed: ${(error as Error).message}`,
    };
  } finally {
    progressBar.finish();
  }
}

async function executeAfterDownloadHook(
  toolConfig: GithubReleaseToolConfig,
  postDownloadContext: PostDownloadInstallContext,
  fs: IFileSystem,
  hookExecutor: HookExecutor,
  logger: TsLogger
): Promise<OperationResult<void>> {
  if (!toolConfig.installParams?.hooks?.afterDownload) {
    return { success: true, data: undefined };
  }

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

  return { success: true, data: undefined };
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
  logger.debug(logs.installer.debug.extractingArchive(), asset.name);

  const extractResult: ExtractResult = await archiveExtractor.extract(downloadPath, {
    targetDir: context.installDir,
  });
  logger.debug(logs.installer.debug.archiveExtracted(), extractResult);

  const postExtractContext = {
    ...postDownloadContext,
    extractDir: context.installDir,
    extractResult,
  };

  const hookResult = await executeAfterExtractHook(toolConfig, postExtractContext, fs, hookExecutor, logger);
  if (!hookResult.success) {
    return hookResult;
  }

  await setupBinariesFromArchive(toolFs, toolName, toolConfig, context, context.installDir, logger, extractResult);

  if (await toolFs.exists(downloadPath)) {
    logger.debug(logs.installer.debug.cleaningArchive(), downloadPath);
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
  if (!toolConfig.installParams?.hooks?.afterExtract) {
    return { success: true, data: undefined };
  }

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

  return { success: true, data: undefined };
}
