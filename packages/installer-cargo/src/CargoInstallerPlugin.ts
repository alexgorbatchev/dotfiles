import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { ICargoClient, HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, CargoInstallParams, CargoToolConfig } from '@dotfiles/schemas';
import { z } from 'zod';
import type { InstallerPlugin, InstallResult, InstallOptions } from '@dotfiles/installer-plugin-system';
import { installFromCargo } from './installFromCargo';

const PLUGIN_VERSION = '1.0.0';

const cargoParamsSchema = z.object({
  crateName: z.string().optional(),
  versionSource: z.enum(['cargo-toml', 'crates-io', 'github-releases']).optional(),
  binarySource: z.enum(['cargo-quickinstall', 'github-releases']).optional(),
  githubRepo: z.string().optional(),
  cargoTomlUrl: z.string().optional(),
  assetPattern: z.string().optional(),
  env: z.record(z.string()).optional(),
  hooks: z.any().optional(),
}) satisfies z.ZodType<CargoInstallParams>;

const cargoToolConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  binaries: z.array(z.string()),
  installationMethod: z.literal('cargo'),
  installParams: cargoParamsSchema,
}) satisfies z.ZodType<CargoToolConfig>;

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
  readonly paramsSchema = cargoParamsSchema;
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
}
