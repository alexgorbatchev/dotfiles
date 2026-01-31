import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  Shell,
  UpdateCheckResult,
} from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { installFromZshPlugin } from './installFromZshPlugin';
import { messages } from './log-messages';
import {
  type ZshPluginInstallParams,
  zshPluginInstallParamsSchema,
  type ZshPluginToolConfig,
  zshPluginToolConfigSchema,
} from './schemas';

const PLUGIN_VERSION = '1.0.0';

type ZshPluginPluginMetadata = {
  method: 'zsh-plugin';
  pluginName: string;
  gitUrl: string;
  pluginPath: string;
};

/**
 * Installer plugin for zsh plugins cloned via git.
 *
 * This plugin handles installation of zsh plugins by cloning git repositories
 * into a plugins directory. It supports both GitHub shorthand (user/repo) and
 * full git URLs for non-GitHub repositories.
 *
 * Plugins are typically loaded by adding them to the plugins array in .zshrc
 * or by sourcing them directly.
 */
export class ZshPluginInstallerPlugin implements
  IInstallerPlugin<
    'zsh-plugin',
    ZshPluginInstallParams,
    ZshPluginToolConfig,
    ZshPluginPluginMetadata
  >
{
  readonly method = 'zsh-plugin';
  readonly displayName = 'Zsh Plugin Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = zshPluginInstallParamsSchema;
  readonly toolConfigSchema = zshPluginToolConfigSchema;
  readonly externallyManaged = false;

  /**
   * Creates a new ZshPluginInstallerPlugin instance.
   *
   * @param fs - The file system interface for file operations.
   * @param shell - The shell executor for running git commands.
   */
  constructor(
    private readonly fs: IResolvedFileSystem,
    private readonly shell: Shell,
  ) {}

  /**
   * Installs a zsh plugin by cloning its git repository.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the zsh plugin.
   * @param context - The base installation context.
   * @param _options - Optional installation options (currently unused).
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: ZshPluginToolConfig,
    context: IInstallContext,
    _options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<ZshPluginPluginMetadata>> {
    const result = await installFromZshPlugin(
      toolName,
      toolConfig,
      context,
      logger,
      this.fs,
      this.shell,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };
  }

  /**
   * Indicates whether this plugin supports version update checking.
   *
   * @returns True, as git repositories can check for updates.
   */
  supportsUpdateCheck(): boolean {
    return true;
  }

  /**
   * Checks for available updates for a zsh plugin.
   *
   * @param toolName - The name of the tool to check.
   * @param _toolConfig - The configuration for the zsh plugin.
   * @param _context - The base installation context.
   * @param logger - The logger instance.
   * @returns A promise that resolves to the update check result.
   */
  async checkUpdate(
    toolName: string,
    _toolConfig: ZshPluginToolConfig,
    _context: IInstallContext,
    logger: TsLogger,
  ): Promise<UpdateCheckResult> {
    // TODO: Implement git fetch/compare for update checking
    logger.warn(messages.updateCheckNotImplemented(toolName));
    return {
      success: true,
      hasUpdate: false,
      currentVersion: 'unknown',
    };
  }

  /**
   * Indicates whether this plugin supports automatic updates.
   *
   * @returns True, as git pull can update the plugin.
   */
  supportsUpdate(): boolean {
    return true;
  }

  /**
   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as zsh plugins don't have standardized README URLs.
   */
  supportsReadme(): boolean {
    return false;
  }
}
