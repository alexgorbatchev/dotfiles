import path from 'node:path';
import type { ICargoClient } from '@modules/cargo-client/ICargoClient';
import type { IDownloader } from '@modules/downloader/IDownloader';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, CargoInstallParams, CargoToolConfig, ExtractResult } from '@types';

import type { HookExecutor } from './HookExecutor';
import type { InstallOptions, InstallResult } from './IInstaller';
import { createToolFileSystem, downloadWithProgress, getBinaryPaths, withInstallErrorHandling } from './utils';

/**
 * Install a tool using Cargo pre-compiled binaries
 */
export async function installFromCargo(
  toolName: string,
  toolConfig: CargoToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  fileSystem: IFileSystem,
  downloader: IDownloader,
  cargoClient: ICargoClient,
  archiveExtractor: IArchiveExtractor,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger
): Promise<InstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromCargo' });
  logger.debug(logs.installer.debug.installingFromCargo(), toolName, toolConfig['installParams']);

  if (!toolConfig['installParams']) {
    return {
      success: false,
      error: 'Install parameters not specified',
    };
  }

  const params = toolConfig['installParams'];
  const crateName = params.crateName || toolName;

  const operation = async (): Promise<InstallResult> => {
    const toolFs = createToolFileSystem(fileSystem, toolName);

    // 1. Determine version
    const version = await determineVersion(crateName, params, cargoClient, logger);
    logger.debug(logs.installer.debug.foundCrateVersion(), crateName, version);

    // 2. Determine download URL based on binary source
    const downloadUrl = await buildDownloadUrl(crateName, version, params, context);
    logger.debug(logs.installer.debug.downloadingAsset(), `${crateName}-${version}`, downloadUrl);

    // 3. Download and extract
    const filename = `${crateName}-${version}.tar.gz`;
    const downloadPath = path.join(context.installDir, filename);

    await downloadWithProgress(downloadUrl, downloadPath, filename, downloader, options);

    // 4. Execute afterDownload hook
    const hookContext = { ...context, version };
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

    // 5. Extract archive
    const extractResult = await archiveExtractor.extract(downloadPath, {
      targetDir: context.installDir,
    });
    logger.debug(logs.installer.debug.archiveExtracted(), extractResult);

    // 6. Setup binaries
    await setupBinaries(params, crateName, context.installDir, fileSystem, logger);

    // 7. Execute afterInstall hook
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

    // 8. Cleanup downloaded archive
    if (await fileSystem.exists(downloadPath)) {
      await fileSystem.rm(downloadPath);
      logger.debug(logs.installer.debug.cleaningArchive(), downloadPath);
    }

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

    return {
      success: true,
      binaryPaths,
      version,
      info: {
        crateName,
        binarySource: params.binarySource || 'cargo-quickinstall',
        downloadUrl,
      },
    };
  };

  return withInstallErrorHandling('cargo', toolName, logger, operation);
}

/**
 * Execute afterDownload hook if configured
 */
async function executeAfterDownloadHook(
  toolConfig: CargoToolConfig,
  hookExecutor: HookExecutor,
  hookContext: BaseInstallContext & { version: string },
  downloadPath: string,
  toolFs: IFileSystem
): Promise<InstallResult | { success: true }> {
  if (toolConfig.installParams?.hooks?.afterDownload) {
    const enhancedContext = hookExecutor.createEnhancedContext({ ...hookContext, downloadPath }, toolFs);
    const hookResult = await hookExecutor.executeHook(
      'afterDownload',
      toolConfig.installParams.hooks.afterDownload,
      enhancedContext
    );
    if (!hookResult.success) {
      return { success: false, error: hookResult.error };
    }
  }
  return { success: true };
}

/**
 * Setup binaries by making them executable
 */
async function setupBinaries(
  params: CargoInstallParams,
  crateName: string,
  installDir: string,
  fileSystem: IFileSystem,
  logger: TsLogger
): Promise<void> {
  const binaryNames = params.customBinaries || [crateName];
  logger.debug(logs.installer.debug.foundBinaries(), binaryNames);

  for (const binaryName of binaryNames) {
    const sourcePath = path.join(installDir, binaryName);

    if (await fileSystem.exists(sourcePath)) {
      await fileSystem.chmod(sourcePath, 0o755);
      logger.debug(logs.installer.debug.makingExecutable(), sourcePath);
    } else {
      logger.debug(logs.installer.debug.binaryNotFound(), binaryName, sourcePath);
    }
  }
}

/**
 * Execute afterInstall hook if configured
 */
async function executeAfterInstallHook(
  toolConfig: CargoToolConfig,
  hookExecutor: HookExecutor,
  hookContext: BaseInstallContext & { version: string },
  extractResult: ExtractResult,
  toolFs: IFileSystem
): Promise<InstallResult | { success: true }> {
  if (toolConfig.installParams?.hooks?.afterInstall) {
    const enhancedContext = hookExecutor.createEnhancedContext({ ...hookContext, extractResult }, toolFs);
    const finalHookResult = await hookExecutor.executeHook(
      'afterInstall',
      toolConfig.installParams.hooks.afterInstall,
      enhancedContext
    );
    if (!finalHookResult.success) {
      return { success: false, error: finalHookResult.error };
    }
  }
  return { success: true };
}

/**
 * Determine the version to install
 */
async function determineVersion(
  crateName: string,
  params: CargoInstallParams,
  cargoClient: ICargoClient,
  logger: TsLogger
): Promise<string> {
  const versionSource = params.versionSource || 'cargo-toml';

  switch (versionSource) {
    case 'cargo-toml': {
      const cargoTomlUrl =
        params.cargoTomlUrl ||
        `https://raw.githubusercontent.com/${params.githubRepo || `${crateName}-community/${crateName}`}/main/Cargo.toml`;

      logger.debug(logs.installer.debug.parsingCrateMetadata(), cargoTomlUrl);

      const packageInfo = await cargoClient.getCargoTomlPackage(cargoTomlUrl);
      if (!packageInfo) {
        throw new Error(`Failed to fetch or parse Cargo.toml from ${cargoTomlUrl}`);
      }
      return packageInfo.version;
    }
    case 'crates-io': {
      logger.debug(logs.installer.debug.queryingCratesIo(), crateName);

      const version = await cargoClient.getLatestVersion(crateName);
      if (!version) {
        throw new Error(`Failed to get latest version for crate ${crateName} from crates.io`);
      }
      return version;
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

/**
 * Get version from GitHub releases (placeholder - would need GitHub API integration)
 */
async function getVersionFromGitHubReleases(githubRepo: string, logger: TsLogger): Promise<string> {
  // This would integrate with the existing GitHub API client
  logger.debug(logs.installer.debug.queryingCratesIo(), githubRepo);
  throw new Error('GitHub releases version source not yet implemented');
}

/**
 * Build download URL based on binary source
 */
async function buildDownloadUrl(
  crateName: string,
  version: string,
  params: CargoInstallParams,
  context: BaseInstallContext
): Promise<string> {
  const binarySource = params.binarySource || 'cargo-quickinstall';
  const platform = getPlatformString(context.systemInfo.platform);
  const arch = getArchString(context.systemInfo.arch);

  switch (binarySource) {
    case 'cargo-quickinstall':
      return `https://github.com/cargo-bins/cargo-quickinstall/releases/download/${crateName}-${version}/${crateName}-${version}-${arch}-${platform}.tar.gz`;

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

      return `https://github.com/${params.githubRepo}/releases/download/v${version}/${assetName}`;
    }

    default:
      throw new Error(`Unknown binary source: ${binarySource}`);
  }
}

/**
 * Convert platform to cargo-quickinstall format
 */
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

/**
 * Convert architecture to cargo-quickinstall format
 */
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
