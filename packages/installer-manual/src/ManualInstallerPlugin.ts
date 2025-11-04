import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, ManualInstallParams, ManualToolConfig } from '@dotfiles/schemas';
import { z } from 'zod';
import type { InstallerPlugin, InstallResult, InstallOptions } from '@dotfiles/installer-plugin-system';
import { installManually } from './installManually';

const PLUGIN_VERSION = '1.0.0';

const manualParamsSchema = z.object({
  env: z.record(z.string()).optional(),
  hooks: z.any().optional(),
}) satisfies z.ZodType<ManualInstallParams>;

const manualToolConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  binaries: z.array(z.string()),
  installationMethod: z.literal('manual'),
  installParams: manualParamsSchema,
}) satisfies z.ZodType<ManualToolConfig>;

type ManualPluginMetadata = {
  method: 'manual';
};

export class ManualInstallerPlugin
  implements InstallerPlugin<'manual', ManualInstallParams, ManualToolConfig, ManualPluginMetadata>
{
  readonly method = 'manual';
  readonly displayName = 'Manual Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = manualParamsSchema;
  readonly toolConfigSchema = manualToolConfigSchema;

  constructor(
    private readonly logger: TsLogger,
    private readonly fs: IFileSystem,
    private readonly hookExecutor: HookExecutor
  ) {}

  async install(
    toolName: string,
    toolConfig: ManualToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<ManualPluginMetadata>> {
    const result = await installManually(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.hookExecutor,
      this.logger
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<ManualPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      metadata: result.metadata,
    };

    return installResult;
  }
}
