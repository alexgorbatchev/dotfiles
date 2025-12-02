import path from 'node:path';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IExtractResult, IInstallOptions, InstallContext, IOperationSuccess } from '@dotfiles/core';
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
import type { CargoInstallResult, ICargoInstallMetadata } from './types';

export async function installFromCargo(
  toolName: string,
  toolConfig: CargoToolConfig,
  context: InstallContext,
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
    const downloadPath = path.join(context.installDir, filename);

    await downloadWithProgress(downloadUrl, downloadPath, filename, downloader, options);

    // TODO hookContext should have proper type
    const hookContext = { ...context, version: versionResult.version };
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
      targetDir: context.installDir,
    });
    logger.debug(messages.archiveExtracted(), extractResult);

    await setupBinariesFromArchive(fs, toolName, toolConfig, context, context.installDir, logger);

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

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

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
  // TODO should use proper type with having to add version here
  hookContext: InstallContext & { version: string },
  downloadPath: string,
  toolFs: IFileSystem
): // TODO CargoInstallResult is actually never returned here?
Promise<CargoInstallResult | { success: true }> {
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
  // TODO should use proper type with having to add version here
  hookContext: InstallContext & { version: string },
  extractResult: IExtractResult,
  toolFs: IFileSystem
): // TODO needs proper return type
Promise<{ success: true } | { success: false; error: string }> {
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
): // TODO needs proper return type
Promise<{ version: string; originalTag?: string }> {
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

async function getVersionFromGitHubReleases(
  githubRepo: string,
  logger: TsLogger
): // TODO needs proper return type
Promise<{ version: string; originalTag?: string }> {
  logger.debug(messages.queryingGitHubReleases(githubRepo));
  throw new Error('GitHub releases version source not yet implemented');
}

async function buildDownloadUrl(
  crateName: string,
  version: string,
  params: CargoInstallParams,
  context: InstallContext,
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

function getPlatformString(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'apple-darwin';
    case 'linux':
      return 'unknown-linux-gnu';
    case 'win32':
      return 'pc-windows-msvc';
    default:
      return platform;
  }
}

function getArchString(arch: string): string {
  switch (arch) {
    case 'arm64':
      return 'aarch64';
    case 'x64':
      return 'x86_64';
    default:
      return arch;
  }
}
