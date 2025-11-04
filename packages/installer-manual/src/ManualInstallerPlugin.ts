import type { BaseInstallContext, InstallerPlugin, InstallOptions, InstallResult } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { installManually } from './installManually';
import {
  type ManualInstallParams,
  type ManualToolConfig,
  manualInstallParamsSchema,
  manualToolConfigSchema,
} from './schemas';

const PLUGIN_VERSION = '1.0.0';

type ManualPluginMetadata = {
  method: 'manual';
};

export class ManualInstallerPlugin
  implements InstallerPlugin<'manual', ManualInstallParams, ManualToolConfig, ManualPluginMetadata>
{
  readonly method = 'manual';
  readonly displayName = 'Manual Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = manualInstallParamsSchema;
  readonly toolConfigSchema = manualToolConfigSchema;

  constructor(
    private readonly logger: TsLogger,
    private readonly fs: IFileSystem
  ) {}

  async install(
    toolName: string,
    toolConfig: ManualToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<ManualPluginMetadata>> {
    const result = await installManually(toolName, toolConfig, context, options, this.fs, this.logger);

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

  supportsUpdateCheck(): boolean {
    return false; // manual installation doesn't support version checking
  }

  supportsUpdate(): boolean {
    return false;
  }

  supportsReadme(): boolean {
    return false;
  }
}
