import { type IArchiveExtractor, isSupportedArchiveFile } from '@dotfiles/archive-extractor';
import {
  createShell,
  type IDownloadContext,
  type IExtractResult,
  type IGitHubReleaseAsset,
  type IInstallContext,
  Platform,
  type Shell,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGitHubApiClient } from '@dotfiles/installer-github';
import type { HookExecutor, IInstallOptions } from '@dotfiles/installer';
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  getBinaryPaths,
  withInstallErrorHandling,
} from '@dotfiles/installer';
import { normalizeBinaries } from '@dotfiles/installer';
import { fetchGitHubRelease, selectAsset } from '@dotfiles/installer-github';
import type { TsLogger } from '@dotfiles/logger';
import { detectVersionViaCli } from '@dotfiles/utils';
import path from 'node:path';
import { messages } from './log-messages';
import type {
  DmgGitHubReleaseSource,
  DmgInstallParams,
  DmgSource,
  DmgToolConfig,
  DmgUrlSource,
} from './schemas';
import type { DmgInstallResult, IDmgInstallMetadata } from './types';

type OperationResult<T> = { success: true; data: T; } | { success: false; error: string; };

interface IResolvedDmgSource {
  downloadPath: string;
  downloadName: string;
  sourceUrl: string;
}

export async function installFromDmg(
  toolName: string,
  toolConfig: DmgToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  shellExecutor: Shell,
  githubApiClient?: IGitHubApiClient,
  ghCliApiClient?: IGitHubApiClient,
): Promise<DmgInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromDmg' });
  logger.debug(messages.installing(toolName));

  // Platform gate: silently skip on non-macOS
  if (context.systemInfo.platform !== Platform.MacOS) {
    logger.info(messages.skippingNonMacOS(toolName));
    return {
      success: true,
      binaryPaths: [],
      metadata: { method: 'dmg', dmgUrl: getSourceLabel(toolConfig.installParams.source) },
    };
  }

  const params: DmgInstallParams = toolConfig.installParams;

  const operation = async (): Promise<DmgInstallResult> => {
    const resolvedSource = await resolveDmgSource(
      params.source,
      context,
      options,
      downloader,
      githubApiClient,
      ghCliApiClient,
      logger,
    );
    if (!resolvedSource.success) {
      return { success: false, error: resolvedSource.error };
    }

    // 2. Run after-download hook
    const postDownloadContext: IDownloadContext = {
      ...context,
      downloadPath: resolvedSource.data.downloadPath,
    };
    const afterDownloadResult = await executeAfterDownloadHook(
      toolConfig,
      postDownloadContext,
      hookExecutor,
      fs,
      logger,
    );
    if (!afterDownloadResult.success) {
      return { success: false, error: afterDownloadResult.error };
    }

    // 3. If downloaded file is an archive, extract it to find the .dmg inside
    let resolvedDmgPath = resolvedSource.data.downloadPath;
    if (isSupportedArchiveFile(resolvedSource.data.downloadName)) {
      logger.debug(messages.extractingArchive());
      const extractResult: IExtractResult = await archiveExtractor.extract(logger, resolvedSource.data.downloadPath, {
        targetDir: context.stagingDir,
      });
      logger.debug(messages.archiveExtracted(extractResult.extractedFiles.length));

      const dmgFile = extractResult.extractedFiles.find((f) => f.endsWith('.dmg'));
      if (!dmgFile) {
        logger.error(messages.noDmgInArchive());
        return { success: false, error: 'No .dmg file found in extracted archive' };
      }
      logger.debug(messages.dmgFoundInArchive(dmgFile));
      resolvedDmgPath = dmgFile;
    }

    // 4. Mount the DMG
    const loggingShell = createShell({ logger, skipCommandLog: true });
    const mountPoint = path.join(context.stagingDir, '.dmg-mount');
    await fs.ensureDir(mountPoint);
    logger.debug(messages.mountingDmg(resolvedDmgPath));
    await loggingShell`hdiutil attach -nobrowse -noautoopen -mountpoint ${mountPoint} ${resolvedDmgPath}`;
    logger.debug(messages.dmgMounted(mountPoint));

    let appName: string;
    try {
      // 5. Find the .app bundle
      const resolvedAppName = await findAppBundle(params.appName, mountPoint, fs, logger);
      if (!resolvedAppName) {
        return { success: false, error: 'No .app bundle found in DMG' };
      }
      appName = resolvedAppName;

      // 6. Copy the .app to staging dir
      const appSource = path.join(mountPoint, appName);
      const appDest = path.join(context.stagingDir, appName);
      logger.debug(messages.copyingApp(appName));
      await shellExecutor`cp -R ${appSource} ${appDest}`.quiet();

      // 7. Symlink binaries from Contents/MacOS/ to stagingDir
      const binaries = normalizeBinaries(toolConfig.binaries);
      for (const binary of binaries) {
        const binarySource = params.binaryPath
          ? path.join(appDest, params.binaryPath)
          : path.join(appDest, 'Contents', 'MacOS', binary.name);
        const binaryDest = path.join(context.stagingDir, binary.name);
        logger.debug(messages.symlinkingBinary(binarySource, binaryDest));
        await fs.symlink(binarySource, binaryDest);
      }
    } finally {
      // 8. Always unmount
      logger.debug(messages.unmountingDmg(mountPoint));
      await shellExecutor`hdiutil detach ${mountPoint}`.quiet().noThrow();
    }

    // 9. Clean up downloaded DMG and archive
    if (await toolFs.exists(resolvedDmgPath)) {
      await toolFs.rm(resolvedDmgPath);
    }
    if (resolvedDmgPath !== resolvedSource.data.downloadPath && (await toolFs.exists(resolvedSource.data.downloadPath))) {
      await toolFs.rm(resolvedSource.data.downloadPath);
    }

    // 10. Resolve binary paths and detect version
    const binaryPaths = getBinaryPaths(toolConfig.binaries, context.stagingDir);

    let detectedVersion: string | undefined;
    const mainBinaryPath = binaryPaths[0];
    if (mainBinaryPath) {
      detectedVersion = await detectVersionViaCli({
        binaryPath: mainBinaryPath,
        args: params.versionArgs,
        regex: params.versionRegex,
        shellExecutor,
      });
    }

    const metadata: IDmgInstallMetadata = {
      method: 'dmg',
      downloadUrl: resolvedSource.data.sourceUrl,
      dmgUrl: resolvedSource.data.sourceUrl,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
      version: detectedVersion || (toolConfig.version !== 'latest' ? toolConfig.version : undefined),
    };
  };

  return withInstallErrorHandling('dmg', toolName, logger, operation);
}

function getSourceLabel(source: DmgSource): string {
  if (source.type === 'url') {
    return source.url;
  }

  return `github-release:${source.repo}`;
}

function getGitHubApiClient(
  source: DmgGitHubReleaseSource,
  githubApiClient: IGitHubApiClient,
  ghCliApiClient: IGitHubApiClient | undefined,
): IGitHubApiClient {
  if (source.ghCli && ghCliApiClient) {
    return ghCliApiClient;
  }

  return githubApiClient;
}

async function resolveDmgSource(
  source: DmgSource,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient | undefined,
  ghCliApiClient: IGitHubApiClient | undefined,
  logger: TsLogger,
): Promise<OperationResult<IResolvedDmgSource>> {
  if (source.type === 'url') {
    return await resolveFromUrlSource(source, context, options, downloader, logger);
  }

  return await resolveFromGitHubReleaseSource(
    source,
    context,
    options,
    downloader,
    githubApiClient,
    ghCliApiClient,
    logger,
  );
}

async function resolveFromUrlSource(
  source: DmgUrlSource,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  logger: TsLogger,
): Promise<OperationResult<IResolvedDmgSource>> {
  logger.debug(messages.downloadingDmg(source.url));
  const downloadName = inferDownloadFileName(source.url, 'download.dmg');
  const downloadPath = path.join(context.stagingDir, downloadName);

  try {
    await downloadWithProgress(logger, source.url, downloadPath, downloadName, downloader, options);
    return {
      success: true,
      data: {
        downloadPath,
        downloadName,
        sourceUrl: source.url,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveFromGitHubReleaseSource(
  source: DmgGitHubReleaseSource,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient | undefined,
  ghCliApiClient: IGitHubApiClient | undefined,
  logger: TsLogger,
): Promise<OperationResult<IResolvedDmgSource>> {
  if (!githubApiClient) {
    return {
      success: false,
      error: 'GitHub API client is not configured for DMG github-release source',
    };
  }

  const apiClient = getGitHubApiClient(source, githubApiClient, ghCliApiClient);
  const releaseVersion = source.version || 'latest';

  const release = await fetchGitHubRelease(
    source.repo,
    releaseVersion,
    source.prerelease ?? false,
    apiClient,
    logger,
  );
  if (!release.success) {
    return release;
  }

  const selectedAsset = await selectAsset(release.data, source, context, logger);
  if (!selectedAsset.success) {
    return selectedAsset;
  }

  const isDmgAsset = selectedAsset.data.name.endsWith('.dmg');
  const isArchiveContainingDmg = isSupportedArchiveFile(selectedAsset.data.name);
  if (!isDmgAsset && !isArchiveContainingDmg) {
    return {
      success: false,
      error: `Selected GitHub release asset must be a .dmg or supported archive: ${selectedAsset.data.name}`,
    };
  }

  const [owner, repoName] = source.repo.split('/');
  if (!owner || !repoName) {
    return {
      success: false,
      error: `Invalid GitHub repository format: ${source.repo}. Expected format: owner/repo`,
    };
  }

  const downloadPath = path.join(context.stagingDir, selectedAsset.data.name);
  const downloadResult = await downloadGitHubAsset(
    source,
    selectedAsset.data,
    owner,
    repoName,
    release.data.tag_name,
    downloadPath,
    options,
    downloader,
    apiClient,
    logger,
  );
  if (!downloadResult.success) {
    return downloadResult;
  }

  return {
    success: true,
    data: {
      downloadPath,
      downloadName: selectedAsset.data.name,
      sourceUrl: selectedAsset.data.browser_download_url,
    },
  };
}

async function downloadGitHubAsset(
  source: DmgGitHubReleaseSource,
  asset: IGitHubReleaseAsset,
  owner: string,
  repoName: string,
  tagName: string,
  downloadPath: string,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  apiClient: IGitHubApiClient,
  logger: TsLogger,
): Promise<OperationResult<void>> {
  if (source.ghCli && apiClient.downloadAsset) {
    try {
      await apiClient.downloadAsset(owner, repoName, tagName, asset.name, downloadPath);
      return { success: true, data: undefined };
    } catch {
      // fall through to HTTP download
    }
  }

  try {
    await downloadWithProgress(logger, asset.browser_download_url, downloadPath, asset.name, downloader, options);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function inferDownloadFileName(rawUrl: string, fallback: string): string {
  try {
    const parsedUrl = new URL(rawUrl);
    const lastPathSegment = parsedUrl.pathname.split('/').pop();
    if (!lastPathSegment) {
      return fallback;
    }
    return decodeURIComponent(lastPathSegment);
  } catch {
    return fallback;
  }
}

async function findAppBundle(
  appName: string | undefined,
  mountPoint: string,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<string | null> {
  if (appName) return appName;

  const entries = await fs.readdir(mountPoint);
  const appEntry = entries.find((e) => e.endsWith('.app'));
  if (!appEntry) {
    logger.error(messages.appNotFound(mountPoint));
    return null;
  }
  return appEntry;
}
