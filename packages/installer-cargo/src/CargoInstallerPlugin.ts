import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type {
  BaseInstallContext,
  InstallerPlugin,
  InstallOptions,
  InstallResult,
  UpdateCheckResult,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import type { ICargoClient } from './cargo-client';
import { installFromCargo } from './installFromCargo';
import { messages } from './log-messages';
import {
  type CargoInstallParams,
  type CargoToolConfig,
  cargoInstallParamsSchema,
  cargoToolConfigSchema,
} from './schemas';

const PLUGIN_VERSION = '1.0.0';

type CargoPluginMetadata = {
  method: 'cargo';
  crateName: string;
  binarySource: string;
  downloadUrl?: string;
};

export class CargoInstallerPlugin
  implements InstallerPlugin<'cargo', CargoInstallParams, CargoToolConfig, CargoPluginMetadata>
{
  readonly method = 'cargo';
  readonly displayName = 'Cargo Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = cargoInstallParamsSchema;
  readonly toolConfigSchema = cargoToolConfigSchema;

  constructor(
    private readonly logger: TsLogger,
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly cargoClient: ICargoClient,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor,
    private readonly githubHost: string
  ) {}

  async install(
    toolName: string,
    toolConfig: CargoToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<CargoPluginMetadata>> {
    const result = await installFromCargo(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.cargoClient,
      this.archiveExtractor,
      this.hookExecutor,
      this.logger,
      this.githubHost
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<CargoPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };

    return installResult;
  }

  supportsUpdateCheck(): boolean {
    return true;
  }

  async checkUpdate(
    toolName: string,
    toolConfig: CargoToolConfig,
    _context: BaseInstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult> {
    try {
      const cargoParams = toolConfig.installParams;
      const crateName = cargoParams?.crateName;

      if (!crateName) {
        return {
          hasUpdate: false,
          error: 'Missing crateName in install params',
        };
      }

      const latestVersion = await this.cargoClient.getLatestVersion(crateName);
      if (!latestVersion) {
        return {
          hasUpdate: false,
          error: `Could not fetch latest version for crate: ${crateName}`,
        };
      }

      const configuredVersion = toolConfig.version || 'latest';

      if (configuredVersion === 'latest') {
        return {
          hasUpdate: false,
          currentVersion: latestVersion,
          latestVersion,
        };
      }

      return {
        hasUpdate: configuredVersion !== latestVersion,
        currentVersion: configuredVersion,
        latestVersion,
      };
    } catch (error) {
      logger.error(messages.updateCheckFailed(toolName), error);
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  supportsUpdate(): boolean {
    return false; // Not implemented yet
  }

  supportsReadme(): boolean {
    return false; // Could be implemented to fetch from crates.io
  }
}
