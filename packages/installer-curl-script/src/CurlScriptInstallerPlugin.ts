import type { IInstallContext, IInstallerPlugin, IInstallOptions, InstallResult, Shell } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { installFromCurlScript } from './installFromCurlScript';
import {
  type CurlScriptInstallParams,
  curlScriptInstallParamsSchema,
  type CurlScriptToolConfig,
  curlScriptToolConfigSchema,
} from './schemas';
import type { ICurlScriptInstallMetadata } from './types';

const PLUGIN_VERSION = '1.0.0';

/**
 * Installer plugin for tools installed via curl scripts.
 *
 * This plugin handles tools that provide installation scripts accessed via URL.
 * It downloads the installation script, makes it executable, and runs it using
 * the specified shell (sh, bash, etc.). The script is responsible for installing
 * the tool to the appropriate location. This method is commonly used by tools
 * like rustup, nvm, and other language/runtime installers.
 *
 * Note: This plugin does not support version checking or automatic updates since
 * the installation is delegated to the external script.
 */
export class CurlScriptInstallerPlugin implements
  IInstallerPlugin<
    'curl-script',
    CurlScriptInstallParams,
    CurlScriptToolConfig,
    ICurlScriptInstallMetadata
  >
{
  readonly method = 'curl-script';
  readonly displayName = 'Curl Script Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = curlScriptInstallParamsSchema;
  readonly toolConfigSchema = curlScriptToolConfigSchema;

  /**
   * Creates a new CurlScriptInstallerPlugin instance.
   *
   * @param fs - The file system interface for file operations.
   * @param downloader - The downloader for fetching installation scripts.
   * @param hookExecutor - The hook executor for running post-download hooks.
   * @param shell - The shell executor for running commands.
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly hookExecutor: HookExecutor,
    private readonly shell: Shell,
  ) {}

  /**
   * Installs a tool using a curl script.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the curl-script tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: CurlScriptToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<ICurlScriptInstallMetadata>> {
    const result = await installFromCurlScript(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.hookExecutor,
      logger,
      this.shell,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<ICurlScriptInstallMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      metadata: result.metadata,
      version: result.version,
    };

    return installResult;
  }

  /**
   * Indicates whether this plugin supports version update checking.
   *
   * @returns False, as curl-script installations delegate to external scripts.
   */
  supportsUpdateCheck(): boolean {
    return false; // curl-script doesn't support version checking
  }

  /**
   * Indicates whether this plugin supports automatic updates.
   *
   * @returns False, as updates must be handled by re-running the installation script.
   */
  supportsUpdate(): boolean {
    return false;
  }

  /**
   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as curl-script installations don't have associated READMEs to fetch.
   */
  supportsReadme(): boolean {
    return false;
  }
}
