import type { IInstallContext, IInstallerPlugin, IInstallOptions, InstallResult } from '@dotfiles/core';
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

/**
 * Installer plugin for manually installed tools.
 *
 * This plugin handles tools that are installed manually by the user rather than
 * automatically downloaded and installed. It verifies that specified binaries exist
 * at the configured paths and creates the necessary symlinks in the installation
 * directory. Since manual tools are managed by the user, this plugin does not
 * support version checking or automatic updates.
 */
export class ManualInstallerPlugin
  implements IInstallerPlugin<'manual', ManualInstallParams, ManualToolConfig, ManualPluginMetadata>
{
  readonly method = 'manual';
  readonly displayName = 'Manual Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = manualInstallParamsSchema;
  readonly toolConfigSchema = manualToolConfigSchema;

  /**
   * Creates a new ManualInstallerPlugin instance.
   *
   * @param fs - The file system interface for file operations.
   */
  constructor(private readonly fs: IFileSystem) {}

  /**
   * Installs a manually managed tool by verifying binaries and creating symlinks.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the manual tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: ManualToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger
  ): Promise<InstallResult<ManualPluginMetadata>> {
    const result = await installManually(toolName, toolConfig, context, options, this.fs, logger);

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

  /**
   * Indicates whether this plugin supports version update checking.
   *
   * @returns False, as manual installations don't support automatic version checking.
   */
  supportsUpdateCheck(): boolean {
    return false; // manual installation doesn't support version checking
  }

  /**
   * Indicates whether this plugin supports automatic updates.
   *
   * @returns False, as manual installations must be updated by the user.
   */
  supportsUpdate(): boolean {
    return false;
  }

  /**
   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as manual installations don't have associated READMEs to fetch.
   */
  supportsReadme(): boolean {
    return false;
  }
}
