import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, CurlScriptInstallParams, CurlScriptToolConfig } from '@dotfiles/schemas';
import { z } from 'zod';
import type { InstallerPlugin, InstallResult, InstallOptions } from '@dotfiles/installer-plugin-system';
import { installFromCurlScript } from './installFromCurlScript';

const PLUGIN_VERSION = '1.0.0';

const curlScriptParamsSchema = z.object({
  url: z.string(),
  shell: z.string(),
  env: z.record(z.string()).optional(),
  hooks: z.any().optional(),
}) satisfies z.ZodType<CurlScriptInstallParams>;

const curlScriptToolConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  binaries: z.array(z.string()),
  installationMethod: z.literal('curl-script'),
  installParams: curlScriptParamsSchema,
}) satisfies z.ZodType<CurlScriptToolConfig>;

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
  readonly paramsSchema = curlScriptParamsSchema;
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
}
