import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, CurlTarInstallParams, CurlTarToolConfig } from '@dotfiles/schemas';
import { z } from 'zod';
import type { InstallerPlugin, InstallResult, InstallOptions } from '@dotfiles/installer-plugin-system';
import { installFromCurlTar } from './installFromCurlTar';

const PLUGIN_VERSION = '1.0.0';

const curlTarParamsSchema = z.object({
  url: z.string(),
  archivePattern: z.string().optional(),
  env: z.record(z.string()).optional(),
  hooks: z.any().optional(),
}) satisfies z.ZodType<CurlTarInstallParams>;

const curlTarToolConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  binaries: z.array(z.string()),
  installationMethod: z.literal('curl-tar'),
  installParams: curlTarParamsSchema,
}) satisfies z.ZodType<CurlTarToolConfig>;

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
  readonly paramsSchema = curlTarParamsSchema;
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
}
