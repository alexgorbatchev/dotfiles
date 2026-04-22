import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IShell,
  IUpdateCheckContext,
  UpdateCheckResult,
} from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";
import { stripVersionPrefix } from "@dotfiles/utils";
import { installFromNpm } from "./installFromNpm";
import { messages } from "./log-messages";
import { type INpmInstallParams, npmInstallParamsSchema, type NpmToolConfig, npmToolConfigSchema } from "./schemas";

const PLUGIN_VERSION = "1.0.0";

type NpmPluginMetadata = {
  method: "npm";
  packageName: string;
};

/**
 * Installer plugin for tools installed via npm.
 *
 * This plugin handles installation of tools published as npm packages.
 * It installs packages globally using `npm install -g` or `bun install -g`,
 * making binaries available through the global bin directory.
 * The plugin is externally managed — the package manager controls binary placement.
 */
export class NpmInstallerPlugin implements IInstallerPlugin<
  "npm",
  INpmInstallParams,
  NpmToolConfig,
  NpmPluginMetadata
> {
  readonly method = "npm";
  readonly displayName = "npm Installer";
  readonly version = PLUGIN_VERSION;
  readonly externallyManaged = true;
  readonly paramsSchema = npmInstallParamsSchema;
  readonly toolConfigSchema = npmToolConfigSchema;

  /**
   * Creates a new NpmInstallerPlugin instance.
   *
   * @param shell - The shell executor for running commands.
   */
  constructor(private readonly shell: IShell) {}

  /**
   * Installs a tool using npm.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the npm tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: NpmToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<NpmPluginMetadata>> {
    const result = await installFromNpm(toolName, toolConfig, context, options, logger, this.shell);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<NpmPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };

    return installResult;
  }

  /**
   * Resolves the version of an npm package before installation.
   *
   * Queries the npm registry for the latest version of the specified package
   * and returns a normalized version string.
   *
   * @param toolName - Name of the tool (for logging purposes)
   * @param toolConfig - Complete tool configuration including package name and version
   * @param _context - Installation context (not used but required by interface)
   * @param logger - Logger instance for debug output
   * @returns Normalized version string, or null if version cannot be resolved
   */
  async resolveVersion(
    toolName: string,
    toolConfig: NpmToolConfig,
    _context: IInstallContext,
    logger: TsLogger,
  ): Promise<string | null> {
    const subLogger: TsLogger = logger.getSubLogger({ name: "resolveVersion" });

    try {
      const params = toolConfig.installParams;
      const packageName: string = params?.package || toolName;

      const result = await this.shell`npm view ${packageName} version`.quiet().noThrow();
      const version: string = result.stdout.toString().trim();

      if (!version) {
        subLogger.debug(messages.versionFetchFailed(packageName));
        return null;
      }

      const normalizedVersion: string = stripVersionPrefix(version);
      subLogger.debug(messages.versionFetched(packageName, normalizedVersion));
      return normalizedVersion;
    } catch (error) {
      subLogger.debug(messages.versionFetchFailed(toolName), error);
      return null;
    }
  }

  /**
   * Indicates whether this plugin supports version updates.
   *
   * @returns True, as npm packages can be updated.
   */
  supportsUpdate(): boolean {
    return true;
  }

  supportsUpdateCheck(): boolean {
    return true;
  }

  /**
   * Checks for available updates for an npm tool.
   *
   * @param toolName - The name of the tool to check.
   * @param toolConfig - The configuration for the npm tool.
   * @param _context - The base installation context (unused).
   * @param logger - The logger instance.
   * @returns A promise that resolves to the update check result.
   */
  async checkUpdate(
    toolName: string,
    toolConfig: NpmToolConfig,
    context: IUpdateCheckContext,
    logger: TsLogger,
  ): Promise<UpdateCheckResult> {
    const subLogger: TsLogger = logger.getSubLogger({ name: "checkUpdate", context: toolName });

    try {
      const params = toolConfig.installParams;
      const packageName: string = params?.package || toolName;

      const result = await this.shell`npm view ${packageName} version`.quiet().noThrow();
      const latestVersion: string = result.stdout.toString().trim();

      if (!latestVersion) {
        const failResult: UpdateCheckResult = {
          success: false,
          error: `Could not fetch latest version for npm package: ${packageName}`,
        };
        return failResult;
      }

      const configuredVersion: string = toolConfig.version || "latest";
      const installedVersion = context.installedVersion ? stripVersionPrefix(context.installedVersion) : undefined;
      const currentVersion =
        configuredVersion === "latest"
          ? (installedVersion ?? configuredVersion)
          : stripVersionPrefix(configuredVersion);

      if (configuredVersion === "latest") {
        const successResult: UpdateCheckResult = {
          success: true,
          hasUpdate: installedVersion !== undefined && installedVersion !== latestVersion,
          currentVersion,
          latestVersion,
        };
        return successResult;
      }

      const successResult: UpdateCheckResult = {
        success: true,
        hasUpdate: currentVersion !== latestVersion,
        currentVersion,
        latestVersion,
      };
      return successResult;
    } catch (error) {
      subLogger.error(messages.updateCheckFailed(), error);
      const failResult: UpdateCheckResult = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return failResult;
    }
  }

  /**
   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as npm packages don't have direct README URLs through this plugin.
   */
  supportsReadme(): boolean {
    return false;
  }
}
