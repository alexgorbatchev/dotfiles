import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IPluginShellInit,
  IShell,
  ShellType,
} from "@dotfiles/core";
import { raw } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import path from "node:path";
import { installFromZshPlugin, resolvePluginName } from "./installFromZshPlugin";
import {
  type IZshPluginInstallParams,
  zshPluginInstallParamsSchema,
  type ZshPluginToolConfig,
  zshPluginToolConfigSchema,
} from "./schemas";

const PLUGIN_VERSION = "1.0.0";

type ZshPluginPluginMetadata = {
  method: "zsh-plugin";
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
export class ZshPluginInstallerPlugin implements IInstallerPlugin<
  "zsh-plugin",
  IZshPluginInstallParams,
  ZshPluginToolConfig,
  ZshPluginPluginMetadata
> {
  readonly method = "zsh-plugin";
  readonly displayName = "Zsh Plugin Installer";
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
    private readonly shell: IShell,
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
    const result = await installFromZshPlugin(toolName, toolConfig, context, logger, this.fs, this.shell);

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
      shellInit: result.shellInit,
    };
  }

  /**
   * Indicates whether this plugin supports version update checking.
   *
   * @returns True, as git repositories can check for updates.
   */
  supportsUpdate(): boolean {
    return true;
  }

  supportsUpdateCheck(): boolean {
    return false;
  }

  /**
   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as zsh plugins don't have standardized README URLs.
   */
  supportsReadme(): boolean {
    return false;
  }

  /**
   * Gets shell initialization content for an already-installed zsh plugin.
   *
   * This is called when the tool is already installed and the installer skips
   * the installation process. Returns the source command for the plugin.
   *
   * @param _toolName - Name of the tool (unused, pluginName derived from params).
   * @param toolConfig - Complete tool configuration.
   * @param installPath - Path where the tool is installed (currentDir).
   * @returns Shell initialization content with the source command.
   */
  getShellInit(
    _toolName: string,
    toolConfig: ZshPluginToolConfig,
    installPath: string,
  ): Partial<Record<ShellType, IPluginShellInit>> | undefined {
    const params = toolConfig.installParams;
    if (!params) {
      return undefined;
    }

    // Derive plugin name from params
    const pluginName = resolvePluginName(params.pluginName, params.repo, params.url);

    // Use explicit source or default pattern
    // For already-installed case, we trust the first pattern since plugin was detected on install
    const source = params.source ?? `${pluginName}.plugin.zsh`;
    const sourceFilePath = path.join(installPath, pluginName, source);

    return {
      zsh: {
        scripts: [raw(`source "${sourceFilePath}"`)],
      },
    };
  }
}
