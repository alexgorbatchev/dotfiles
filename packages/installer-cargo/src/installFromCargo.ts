import path from 'node:path';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IExtractResult, IInstallContext, IInstallOptions } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import {
  createToolFileSystem,
  downloadWithProgress,
  getBinaryPaths,
  setupBinariesFromArchive,
  withInstallErrorHandling,
} from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { normalizeVersion } from '@dotfiles/utils';
import type { ICargoClient } from './cargo-client';
import { messages } from './log-messages';
import type { CargoInstallParams, CargoToolConfig } from './schemas';
import type {
  CargoInstallResult,
  HookExecutionResult,
  ICargoHookContext,
  ICargoInstallMetadata,
  IVersionResult,
} from './types';

export async function installFromCargo(
  toolName: string,
  toolConfig: CargoToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  cargoClient: ICargoClient,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  githubHost: string
): Promise<CargoInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromCargo' });
  logger.debug(messages.installing(toolName));

  if (!toolConfig['installParams']) {
    return {
      success: false,
      error: 'Install parameters not specified',
    };
  }

  const params = toolConfig['installParams'];
  const crateName = params.crateName || toolName;

  const operation = async (): Promise<CargoInstallResult> => {
    const toolFs = createToolFileSystem(fs, toolName);

    const versionResult = await determineVersion(crateName, params, cargoClient, logger);
    logger.debug(messages.foundVersion(crateName, versionResult.version));

    const downloadUrl = await buildDownloadUrl(crateName, versionResult.version, params, context, githubHost);
    logger.debug(messages.downloadingAsset(`${crateName}-${versionResult.version}`, downloadUrl));

    const filename = `${crateName}-${versionResult.version}.tar.gz`;
    const downloadPath = path.join(context.stagingDir, filename);

    await downloadWithProgress(downloadUrl, downloadPath, filename, downloader, options);

    const hookContext: ICargoHookContext = { ...context, version: versionResult.version };
    const afterDownloadResult = await executeAfterDownloadHook(
      toolConfig,
      hookExecutor,
      hookContext,
      downloadPath,
      toolFs
    );
    if (!afterDownloadResult.success) {
      return afterDownloadResult;
    }

    const extractResult = await archiveExtractor.extract(downloadPath, {
      targetDir: context.stagingDir,
    });
    logger.debug(messages.archiveExtracted(), extractResult);

    await setupBinariesFromArchive(fs, toolName, toolConfig, context, context.stagingDir, logger);

    const afterInstallResult = await executeAfterInstallHook(
      toolConfig,
      hookExecutor,
      hookContext,
      extractResult,
      toolFs
    );
    if (!afterInstallResult.success) {
      return afterInstallResult;
    }

    if (await fs.exists(downloadPath)) {
      await fs.rm(downloadPath);
      logger.debug(messages.cleaningArchive(downloadPath));
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.stagingDir);

    const metadata: ICargoInstallMetadata = {
      method: 'cargo',
      crateName,
      binarySource: params.binarySource || 'cargo-quickinstall',
      downloadUrl,
    };

    return {
      success: true,
      binaryPaths,
      version: versionResult.version,
      originalTag: versionResult.originalTag,
      metadata,
    };
  };

  return withInstallErrorHandling('cargo', toolName, logger, operation);
}

async function executeAfterDownloadHook(
  toolConfig: CargoToolConfig,
  hookExecutor: HookExecutor,
  hookContext: ICargoHookContext,
  downloadPath: string,
  toolFs: IFileSystem
): Promise<HookExecutionResult> {
  const afterDownloadHooks = toolConfig['installParams']?.hooks?.['after-download'];
  if (!afterDownloadHooks) {
    return { success: true };
  }

  const enhancedContext = hookExecutor.createEnhancedContext({ ...hookContext, downloadPath }, toolFs);

  for (const hook of afterDownloadHooks) {
    const hookResult = await hookExecutor.executeHook('afterDownload', hook, enhancedContext);
    if (!hookResult.success) {
      return { success: false, error: hookResult.error };
    }
  }

  return { success: true };
}

async function executeAfterInstallHook(
  toolConfig: CargoToolConfig,
  hookExecutor: HookExecutor,
  hookContext: ICargoHookContext,
  extractResult: IExtractResult,
  toolFs: IFileSystem
): Promise<HookExecutionResult> {
  const afterInstallHooks = toolConfig['installParams']?.hooks?.['after-install'];
  if (!afterInstallHooks) {
    return { success: true };
  }

  const enhancedContext = hookExecutor.createEnhancedContext({ ...hookContext, extractResult }, toolFs);

  for (const hook of afterInstallHooks) {
    const finalHookResult = await hookExecutor.executeHook('afterInstall', hook, enhancedContext);
    if (!finalHookResult.success) {
      return { success: false, error: finalHookResult.error };
    }
  }
  return { success: true };
}

async function determineVersion(
  crateName: string,
  params: CargoInstallParams,
  cargoClient: ICargoClient,
  logger: TsLogger
): Promise<IVersionResult> {
  const versionSource = params.versionSource || 'cargo-toml';

  switch (versionSource) {
    case 'cargo-toml': {
      const cargoTomlUrl =
        params.cargoTomlUrl ||
        cargoClient.buildCargoTomlUrl(params.githubRepo || `${crateName}-community/${crateName}`);

      logger.debug(messages.parsingMetadata(cargoTomlUrl));

      const packageInfo = await cargoClient.getCargoTomlPackage(cargoTomlUrl);
      if (!packageInfo) {
        throw new Error(`Failed to fetch or parse Cargo.toml from ${cargoTomlUrl}`);
      }
      return { version: normalizeVersion(packageInfo.version) };
    }
    case 'crates-io': {
      logger.debug(messages.queryingCratesIo(crateName));

      const version = await cargoClient.getLatestVersion(crateName);
      if (!version) {
        throw new Error(`Failed to get latest version for crate ${crateName} from crates.io`);
      }
      return { version: normalizeVersion(version) };
    }
    case 'github-releases': {
      if (!params.githubRepo) {
        throw new Error('githubRepo is required when using github-releases version source');
      }
      return getVersionFromGitHubReleases(params.githubRepo, logger);
    }
    default:
      throw new Error(`Unknown version source: ${versionSource}`);
  }
}

async function getVersionFromGitHubReleases(githubRepo: string, logger: TsLogger): Promise<IVersionResult> {
  logger.debug(messages.queryingGitHubReleases(githubRepo));
  throw new Error('GitHub releases version source not yet implemented');
}

async function buildDownloadUrl(
  crateName: string,
  version: string,
  params: CargoInstallParams,
  context: IInstallContext,
  githubReleaseHost: string
): Promise<string> {
  const binarySource = params.binarySource || 'cargo-quickinstall';
  const platform = getPlatformString(context.systemInfo.platform);
  const arch = getArchString(context.systemInfo.arch);

  switch (binarySource) {
    case 'cargo-quickinstall': {
      const url = `${githubReleaseHost}/cargo-bins/cargo-quickinstall/releases/download/${crateName}-${version}/${crateName}-${version}-${arch}-${platform}.tar.gz`;
      return url;
    }

    case 'github-releases': {
      if (!params.githubRepo) {
        throw new Error('githubRepo is required when using github-releases binary source');
      }
      const assetPattern = params.assetPattern || '{crateName}-{version}-{platform}-{arch}.tar.gz';
      const assetName = assetPattern
        .replace('{crateName}', crateName)
        .replace('{version}', version)
        .replace('{platform}', platform)
        .replace('{arch}', arch);

      const url = `${githubReleaseHost}/${params.githubRepo}/releases/download/v${version}/${assetName}`;
      return url;
    }

    default:
      throw new Error(`Unknown binary source: ${binarySource}`);
  }
}

function getPlatformString(platform: Platform): string {
  switch (platform) {
    case Platform.MacOS:
      return 'apple-darwin';
    case Platform.Linux:
      return 'unknown-linux-gnu';
    case Platform.Windows:
      return 'pc-windows-msvc';
    default:
      return 'unknown';
  }
}

function getArchString(arch: Architecture): string {
  switch (arch) {
    case Architecture.Arm64:
      return 'aarch64';
    case Architecture.X86_64:
      return 'x86_64';
    default:
      return 'unknown';
  }
}
