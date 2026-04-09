import type { IInstallContext, IInstallerPlugin, IInstallOptions, InstallResult, IShell } from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";
import { installFromBrew } from "./installFromBrew";
import { type IBrewInstallParams, brewInstallParamsSchema, type BrewToolConfig, brewToolConfigSchema } from "./schemas";

const PLUGIN_VERSION = "1.0.0";

type BrewPluginMetadata = {
  method: "brew";
  formula: string;
  isCask: boolean;
  tap?: string | string[];
};

/**
 * Installer plugin for tools installed via Homebrew.
 *
 * This plugin handles installation of tools through the Homebrew package manager
 * on macOS and Linux. It supports both formulae (command-line tools) and casks
 * (macOS applications). The plugin can handle custom taps, version checking via
 * `brew info`, and respects the --force flag for reinstallations.
 *
 * Note: Tools installed via Homebrew are externally managed, meaning Homebrew
 * handles the actual file placement and versioning.
 */
export class BrewInstallerPlugin implements IInstallerPlugin<
  "brew",
  IBrewInstallParams,
  BrewToolConfig,
  BrewPluginMetadata
> {
  readonly method = "brew";
  readonly displayName = "Homebrew Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = brewInstallParamsSchema;
  readonly toolConfigSchema = brewToolConfigSchema;

  /**
   * Creates a new BrewInstallerPlugin instance.
   *
   * @param shell - The shell executor for running commands.
   */
  constructor(private readonly shell: IShell) {}
  readonly externallyManaged = true;

  /**
   * Installs a tool using Homebrew.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the Homebrew tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: BrewToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<BrewPluginMetadata>> {
    const result = await installFromBrew(toolName, toolConfig, context, options, logger, this.shell);

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

  /**
   * Indicates whether this plugin supports version update checking.
   *
   * @returns True, as Homebrew provides version information via `brew info`.
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
   * @returns False, as Homebrew formulas don't have direct README URLs.
   */
  supportsReadme(): boolean {
    return false; // Brew formulas don't have direct README URLs
  }
}
