import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, BrewInstallParams, BrewToolConfig } from '@dotfiles/schemas';
import { z } from 'zod';
import type { InstallerPlugin, InstallResult, InstallOptions } from '@dotfiles/installer-plugin-system';
import { installFromBrew } from './installFromBrew';

const PLUGIN_VERSION = '1.0.0';

const brewParamsSchema = z.object({
  formula: z.string().optional(),
  cask: z.boolean().optional(),
  tap: z.union([z.string(), z.array(z.string())]).optional(),
}) satisfies z.ZodType<BrewInstallParams>;

const brewToolConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  binaries: z.array(z.string()),
  installationMethod: z.literal('brew'),
  installParams: brewParamsSchema,
}) satisfies z.ZodType<BrewToolConfig>;

type BrewPluginMetadata = {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
};

export class BrewInstallerPlugin
  implements InstallerPlugin<'brew', BrewInstallParams, BrewToolConfig, BrewPluginMetadata>
{
  readonly method = 'brew';
  readonly displayName = 'Homebrew Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = brewParamsSchema;
  readonly toolConfigSchema = brewToolConfigSchema;

  constructor(private readonly logger: TsLogger) {}

  async install(
    toolName: string,
    toolConfig: BrewToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<BrewPluginMetadata>> {
    const result = await installFromBrew(
      toolName,
      toolConfig,
      context,
      options,
      this.logger
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<BrewPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };

    return installResult;
  }
}
