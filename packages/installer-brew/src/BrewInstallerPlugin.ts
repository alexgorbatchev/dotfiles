import type {
  IInstallerPlugin,
  IInstallOptions,
  IInstallContext,
  InstallResult,
  UpdateCheckResult,
} from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { installFromBrew } from './installFromBrew';
import { messages } from './log-messages';
import { type BrewInstallParams, type BrewToolConfig, brewInstallParamsSchema, brewToolConfigSchema } from './schemas';

const PLUGIN_VERSION = '1.0.0';

type BrewPluginMetadata = {
  method: 'brew';
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
export class BrewInstallerPlugin
  implements IInstallerPlugin<'brew', BrewInstallParams, BrewToolConfig, BrewPluginMetadata>
{
  readonly method = 'brew';
  readonly displayName = 'Homebrew Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = brewInstallParamsSchema;
  readonly toolConfigSchema = brewToolConfigSchema;
  readonly externallyManaged = true;

  /**
   * Creates a new BrewInstallerPlugin instance.
   *
   * @param logger - The logger instance for logging operations.
   */
  constructor(private readonly logger: TsLogger) {}

  /**
   * Installs a tool using Homebrew.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the Homebrew tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: BrewToolConfig,
    context: IInstallContext,
    options?: IInstallOptions
  ): Promise<InstallResult<BrewPluginMetadata>> {
    const result = await installFromBrew(toolName, toolConfig, context, options, this.logger);

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
  supportsUpdateCheck(): boolean {
    return true;
  }

  /**
   * Checks for available updates for a Homebrew tool.
   *
   * @param toolName - The name of the tool to check.
   * @param toolConfig - The configuration for the Homebrew tool.
   * @param _context - The base installation context (unused).
   * @param logger - The logger instance.
   * @returns A promise that resolves to the update check result.
   */
  async checkUpdate(
    toolName: string,
    toolConfig: BrewToolConfig,
    _context: IInstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult> {
    // TODO: Implement actual brew info check
    // For now, return a placeholder result
    logger.warn(messages.updateCheckNotImplemented(toolName));
    const result: UpdateCheckResult = {
      success: true,
      hasUpdate: false,
      currentVersion: toolConfig.version || 'latest',
    };
    return result;
  }

  /**
   * Indicates whether this plugin supports automatic updates.
   *
   * @returns False, as automatic updates are not yet implemented.
   */
  supportsUpdate(): boolean {
    return false; // Not implemented yet
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
