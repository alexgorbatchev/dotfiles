import type { IInstallContext, IInstallerPlugin, IInstallOptions, InstallResult, IShell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { installFromCurlBinary } from "./installFromCurlBinary";
import {
  type ICurlBinaryInstallParams,
  curlBinaryInstallParamsSchema,
  type CurlBinaryToolConfig,
  curlBinaryToolConfigSchema,
} from "./schemas";
import type { ICurlBinaryInstallMetadata } from "./types";

const PLUGIN_VERSION = "1.0.0";

/**
 * Installer plugin for tools distributed as standalone binary files via direct URLs.
 *
 * This plugin handles tools where the download URL points directly to an executable binary,
 * rather than a compressed archive. It downloads the binary, makes it executable, and sets
 * up the binary path. This method is useful for tools that provide platform-specific
 * binaries as direct downloads (e.g., single-file Go binaries, Rust binaries).
 *
 * The plugin supports lifecycle hooks for custom processing after download.
 * It does not support version checking or automatic updates since the URLs
 * are typically static.
 */
export class CurlBinaryInstallerPlugin implements IInstallerPlugin<
  "curl-binary",
  ICurlBinaryInstallParams,
  CurlBinaryToolConfig,
  ICurlBinaryInstallMetadata
> {
  readonly method = "curl-binary";
  readonly displayName = "Curl Binary Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = curlBinaryInstallParamsSchema;
  readonly toolConfigSchema = curlBinaryToolConfigSchema;

  /**
   * Creates a new CurlBinaryInstallerPlugin instance.
   *
   * @param fs - The file system interface for file operations.
   * @param downloader - The downloader for fetching binaries.
   * @param hookExecutor - The hook executor for running lifecycle hooks.
   * @param shell - The shell executor for running commands.
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly hookExecutor: HookExecutor,
    private readonly shell: IShell,
  ) {}

  /**
   * Installs a tool from a direct binary URL.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the curl-binary tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: CurlBinaryToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<ICurlBinaryInstallMetadata>> {
    const result = await installFromCurlBinary(
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

    const installResult: InstallResult<ICurlBinaryInstallMetadata> = {
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
   * @returns False, as curl-binary installations use static URLs.
   */
  supportsUpdate(): boolean {
    return false;
  }

  supportsUpdateCheck(): boolean {
    return false;
  }

  /**

   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as curl-binary installations don't have associated READMEs to fetch.
   */
  supportsReadme(): boolean {
    return false;
  }
}
