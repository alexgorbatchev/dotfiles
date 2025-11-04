import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { BaseInstallContext, InstallerPlugin, InstallOptions, InstallResult } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { installFromCurlTar } from './installFromCurlTar';
import {
  type CurlTarInstallParams,
  type CurlTarToolConfig,
  curlTarInstallParamsSchema,
  curlTarToolConfigSchema,
} from './schemas';

const PLUGIN_VERSION = '1.0.0';

type CurlTarPluginMetadata = {
  method: 'curl-tar';
  downloadUrl: string;
};

export class CurlTarInstallerPlugin
  implements InstallerPlugin<'curl-tar', CurlTarInstallParams, CurlTarToolConfig, CurlTarPluginMetadata>
{
  readonly method = 'curl-tar';
  readonly displayName = 'Curl Tar Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = curlTarInstallParamsSchema;
  readonly toolConfigSchema = curlTarToolConfigSchema;

  constructor(
    private readonly logger: TsLogger,
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor
  ) {}

  async install(
    toolName: string,
    toolConfig: CurlTarToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<CurlTarPluginMetadata>> {
    const result = await installFromCurlTar(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.archiveExtractor,
      this.hookExecutor,
      this.logger
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<CurlTarPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };

    return installResult;
  }

  supportsUpdateCheck(): boolean {
    return false; // curl-tar doesn't support version checking
  }

  supportsUpdate(): boolean {
    return false;
  }

  supportsReadme(): boolean {
    return false;
  }
}
