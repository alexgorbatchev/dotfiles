import { type IArchiveExtractor, isSupportedArchiveFile } from "@dotfiles/archive-extractor";
import {
  createShell,
  type IDownloadContext,
  type IExtractContext,
  type IExtractResult,
  type IGitHubRelease,
  type IGitHubReleaseAsset,
  type IInstallContext,
  Platform,
  type IShell,
} from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor, IInstallOptions } from "@dotfiles/installer";
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  executeAfterExtractHook,
  normalizeBinaries,
  runWithSudo,
  withInstallErrorHandling,
} from "@dotfiles/installer";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import { fetchGitHubRelease, selectAsset } from "@dotfiles/installer-github";
import type { TsLogger } from "@dotfiles/logger";
import { detectVersionViaCli } from "@dotfiles/utils";
import path from "node:path";
import { getPkgInstallerPath, shouldAllowNonMacOSPkgInstall } from "./installerPath";
import { messages } from "./log-messages";
import type { IPkgGitHubReleaseSource, IPkgInstallParams, IPkgUrlSource, PkgSource, PkgToolConfig } from "./schemas";
import type { IPkgInstallMetadata, PkgInstallResult } from "./types";

type OperationResult<T> = { success: true; data: T } | { success: false; error: string };

interface IResolvedPkgSource {
  downloadPath: string;
  downloadName: string;
  sourceUrl: string;
}

export async function installFromPkg(
  toolName: string,
  toolConfig: PkgToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  shellExecutor: IShell,
  githubApiClient?: IGitHubApiClient,
  ghCliApiClient?: IGitHubApiClient,
): Promise<PkgInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: "installFromPkg" });
  logger.debug(messages.installing(toolName));

  if (context.systemInfo.platform !== Platform.MacOS && !shouldAllowNonMacOSPkgInstall()) {
    logger.info(messages.skippingNonMacOS(toolName));
    return {
      success: true,
      binaryPaths: [],
      metadata: {
        method: "pkg",
        pkgUrl: getSourceLabel(toolConfig.installParams.source),
        target: toolConfig.installParams.target || "/",
      },
    };
  }

  const params: IPkgInstallParams = toolConfig.installParams;

  const operation = async (): Promise<PkgInstallResult> => {
    await fs.ensureDir(context.stagingDir);

    const resolvedSource = await resolvePkgSource(
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

    let resolvedPkgPath = resolvedSource.data.downloadPath;
    if (isSupportedArchiveFile(resolvedSource.data.downloadName)) {
      logger.debug(messages.extractingArchive());
      const extractResult: IExtractResult = await archiveExtractor.extract(logger, resolvedSource.data.downloadPath, {
        targetDir: context.stagingDir,
      });
      logger.debug(messages.archiveExtracted(extractResult.extractedFiles.length));

      const postExtractContext: IExtractContext = {
        ...postDownloadContext,
        extractDir: context.stagingDir,
        extractResult,
      };
      const afterExtractResult = await executeAfterExtractHook(
        toolConfig,
        postExtractContext,
        hookExecutor,
        fs,
        logger,
      );
      if (!afterExtractResult.success) {
        return { success: false, error: afterExtractResult.error };
      }

      const pkgFile = await findPkgFile(extractResult, context.stagingDir, fs);
      if (!pkgFile) {
        logger.error(messages.noPkgInArchive());
        return { success: false, error: "No .pkg file found in extracted archive" };
      }

      logger.debug(messages.pkgFoundInArchive(pkgFile));
      resolvedPkgPath = pkgFile;
    }

    const target = params.target || "/";
    const installerPath = getPkgInstallerPath();
    logger.debug(messages.runningInstaller(resolvedPkgPath, target));
    if (toolConfig.sudo) {
      await runWithSudo(toolName, context, {
        command: [installerPath, "-pkg", resolvedPkgPath, "-target", target],
        cwd: context.stagingDir,
        failureLabel: "sudo installer",
      });
    } else {
      const loggingShell = createShell({ logger, skipCommandLog: true });
      await loggingShell`${installerPath} -pkg ${resolvedPkgPath} -target ${target}`;
    }

    if (await toolFs.exists(resolvedPkgPath)) {
      await toolFs.rm(resolvedPkgPath);
    }
    if (
      resolvedPkgPath !== resolvedSource.data.downloadPath &&
      (await toolFs.exists(resolvedSource.data.downloadPath))
    ) {
      await toolFs.rm(resolvedSource.data.downloadPath);
    }

    const resolvedBinaryPaths = await resolveBinaryPaths(toolConfig, params, fs, shellExecutor, logger);
    if (!resolvedBinaryPaths.success) {
      return { success: false, error: resolvedBinaryPaths.error };
    }

    let detectedVersion: string | undefined;
    const mainBinaryPath = resolvedBinaryPaths.data[0];
    if (mainBinaryPath) {
      detectedVersion = await detectVersionViaCli({
        binaryPath: mainBinaryPath,
        args: params.versionArgs,
        regex: params.versionRegex,
        shellExecutor,
      });
    }

    const metadata: IPkgInstallMetadata = {
      method: "pkg",
      downloadUrl: resolvedSource.data.sourceUrl,
      pkgUrl: resolvedSource.data.sourceUrl,
      target,
    };

    return {
      success: true,
      binaryPaths: resolvedBinaryPaths.data,
      metadata,
      version: detectedVersion || (toolConfig.version !== "latest" ? toolConfig.version : undefined),
    };
  };

  return withInstallErrorHandling("pkg", toolName, logger, operation);
}

function getSourceLabel(source: PkgSource): string {
  if (source.type === "url") {
    return source.url;
  }

  return `github-release:${source.repo}`;
}

async function resolveBinaryPaths(
  toolConfig: PkgToolConfig,
  params: IPkgInstallParams,
  fs: IFileSystem,
  shellExecutor: IShell,
  logger: TsLogger,
): Promise<OperationResult<string[]>> {
  const binaries = normalizeBinaries(toolConfig.binaries);
  if (binaries.length === 0) {
    return { success: true, data: [] };
  }

  const binaryPaths: string[] = [];
  for (const [index, binary] of binaries.entries()) {
    const explicitPath = index === 0 ? params.binaryPath : undefined;
    if (explicitPath) {
      const exists = await fs.exists(explicitPath);
      if (!exists) {
        return {
          success: false,
          error: `Configured pkg binaryPath does not exist after installation: ${explicitPath}`,
        };
      }
      binaryPaths.push(explicitPath);
      continue;
    }

    logger.debug(messages.resolvingBinary(binary.name));
    try {
      const commandResult = await shellExecutor`command -v ${binary.name}`.quiet();
      const resolvedPath = commandResult.stdout.toString().trim();
      if (!resolvedPath) {
        logger.warn(messages.binaryNotFound(binary.name));
        continue;
      }
      binaryPaths.push(resolvedPath);
    } catch {
      logger.warn(messages.binaryNotFound(binary.name));
    }
  }

  return { success: true, data: binaryPaths };
}

async function findPkgFile(extractResult: IExtractResult, stagingDir: string, fs: IFileSystem): Promise<string | null> {
  for (const filePath of extractResult.extractedFiles) {
    if (filePath.endsWith(".pkg") && (await fs.exists(filePath))) {
      return filePath;
    }
  }

  const entries = await fs.readdir(stagingDir);
  const pkgEntry = entries.find((entry) => entry.endsWith(".pkg"));
  return pkgEntry ? path.join(stagingDir, pkgEntry) : null;
}

function getGitHubApiClient(
  source: IPkgGitHubReleaseSource,
  githubApiClient: IGitHubApiClient,
  ghCliApiClient: IGitHubApiClient | undefined,
): IGitHubApiClient {
  if (source.ghCli && ghCliApiClient) {
    return ghCliApiClient;
  }

  return githubApiClient;
}

async function resolvePkgSource(
  source: PkgSource,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient | undefined,
  ghCliApiClient: IGitHubApiClient | undefined,
  logger: TsLogger,
): Promise<OperationResult<IResolvedPkgSource>> {
  if (source.type === "url") {
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
  source: IPkgUrlSource,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  logger: TsLogger,
): Promise<OperationResult<IResolvedPkgSource>> {
  logger.debug(messages.downloadingPkg(source.url));
  const downloadName = inferDownloadFileName(source.url, "download.pkg");
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
  source: IPkgGitHubReleaseSource,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  downloader: IDownloader,
  githubApiClient: IGitHubApiClient | undefined,
  ghCliApiClient: IGitHubApiClient | undefined,
  logger: TsLogger,
): Promise<OperationResult<IResolvedPkgSource>> {
  if (!githubApiClient) {
    return {
      success: false,
      error: "GitHub API client is not configured for PKG github-release source",
    };
  }

  const apiClient = getGitHubApiClient(source, githubApiClient, ghCliApiClient);
  const releaseVersion = source.version || "latest";

  const release = await fetchGitHubRelease(source.repo, releaseVersion, source.prerelease ?? false, apiClient, logger);
  if (!release.success) {
    return release;
  }

  const selectedAsset = await selectPkgAsset(release.data, source, context, logger);
  if (!selectedAsset.success) {
    return selectedAsset;
  }

  const [owner, repoName] = source.repo.split("/");
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

async function selectPkgAsset(
  release: IGitHubRelease,
  source: IPkgGitHubReleaseSource,
  context: IInstallContext,
  logger: TsLogger,
): Promise<OperationResult<IGitHubReleaseAsset>> {
  const pkgLikeAssets = release.assets.filter(
    (asset) => asset.name.endsWith(".pkg") || isSupportedArchiveFile(asset.name),
  );
  const selectionRelease: IGitHubRelease = {
    ...release,
    assets: pkgLikeAssets.length > 0 ? pkgLikeAssets : release.assets,
  };

  const selectedAsset = await selectAsset(selectionRelease, source, context, logger);
  if (!selectedAsset.success) {
    return selectedAsset;
  }

  const isPkgAsset = selectedAsset.data.name.endsWith(".pkg");
  const isArchiveContainingPkg = isSupportedArchiveFile(selectedAsset.data.name);
  if (!isPkgAsset && !isArchiveContainingPkg) {
    return {
      success: false,
      error: `Selected GitHub release asset must be a .pkg or supported archive: ${selectedAsset.data.name}`,
    };
  }

  return selectedAsset;
}

async function downloadGitHubAsset(
  source: IPkgGitHubReleaseSource,
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
      // Fall through to HTTP download.
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
    const lastPathSegment = parsedUrl.pathname.split("/").pop();
    if (!lastPathSegment) {
      return fallback;
    }

    return decodeURIComponent(lastPathSegment);
  } catch {
    return fallback;
  }
}
