import type { BaseInstallContext, InstallerPlugin, InstallOptions, InstallResult } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { installFromCurlScript } from './installFromCurlScript';
import {
  type CurlScriptInstallParams,
  type CurlScriptToolConfig,
  curlScriptInstallParamsSchema,
  curlScriptToolConfigSchema,
} from './schemas';

const PLUGIN_VERSION = '1.0.0';

type CurlScriptPluginMetadata = {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
};

export class CurlScriptInstallerPlugin
  implements InstallerPlugin<'curl-script', CurlScriptInstallParams, CurlScriptToolConfig, CurlScriptPluginMetadata>
{
  readonly method = 'curl-script';
  readonly displayName = 'Curl Script Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = curlScriptInstallParamsSchema;
  readonly toolConfigSchema = curlScriptToolConfigSchema;

  constructor(
    private readonly logger: TsLogger,
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly hookExecutor: HookExecutor
  ) {}

  async install(
    toolName: string,
    toolConfig: CurlScriptToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<CurlScriptPluginMetadata>> {
    const result = await installFromCurlScript(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.hookExecutor,
      this.logger
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<CurlScriptPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      metadata: result.metadata,
    };

    return installResult;
  }

  supportsUpdateCheck(): boolean {
    return false; // curl-script doesn't support version checking
  }

  supportsUpdate(): boolean {
    return false;
  }

  supportsReadme(): boolean {
    return false;
  }
}
