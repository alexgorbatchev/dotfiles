import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import type { IInstallContext, IInstallerPlugin, IInstallOptions, InstallResult, Shell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { installFromCurlTar } from "./installFromCurlTar";
import {
  type CurlTarInstallParams,
  curlTarInstallParamsSchema,
  type CurlTarToolConfig,
  curlTarToolConfigSchema,
} from "./schemas";
import type { ICurlTarInstallMetadata } from "./types";

const PLUGIN_VERSION = "1.0.0";

/**
 * Installer plugin for tools distributed as tarballs via direct URLs.
 *
 * This plugin handles tools that are distributed as compressed archives (tar.gz, tar.bz2, etc.)
 * accessible via HTTP/HTTPS URLs. It downloads the tarball, extracts it to the installation
 * directory, and sets up the binaries. This method is commonly used for pre-compiled binaries
 * and tools that provide direct download links for their releases.
 *
 * The plugin supports lifecycle hooks for custom processing at different stages (after download,
 * after extraction). It does not support version checking or automatic updates since the URLs
 * are typically static.
 */
export class CurlTarInstallerPlugin implements IInstallerPlugin<
  "curl-tar",
  CurlTarInstallParams,
  CurlTarToolConfig,
  ICurlTarInstallMetadata
> {
  readonly method = "curl-tar";
  readonly displayName = "Curl Tar Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = curlTarInstallParamsSchema;
  readonly toolConfigSchema = curlTarToolConfigSchema;

  /**
   * Creates a new CurlTarInstallerPlugin instance.
   *
   * @param fs - The file system interface for file operations.
   * @param downloader - The downloader for fetching tarballs.
   * @param archiveExtractor - The archive extractor for unpacking tarballs.
   * @param hookExecutor - The hook executor for running lifecycle hooks.
   * @param shell - The shell executor for running commands.
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor,
    private readonly shell: Shell,
  ) {}

  /**
   * Installs a tool from a tarball URL.
   *
   * @param toolName - The name of the tool to install.
   * @param toolConfig - The configuration for the curl-tar tool.
   * @param context - The base installation context.
   * @param options - Optional installation options.
   * @param logger - The logger with tool context for logging operations.
   * @returns A promise that resolves to the installation result.
   */
  async install(
    toolName: string,
    toolConfig: CurlTarToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<ICurlTarInstallMetadata>> {
    const result = await installFromCurlTar(
      toolName,
      toolConfig,
      context,
      options,
      this.fs,
      this.downloader,
      this.archiveExtractor,
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

    const installResult: InstallResult<ICurlTarInstallMetadata> = {
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
   * @returns False, as curl-tar installations use static URLs.
   */
  supportsUpdate(): boolean {
    return false;
  }

  supportsUpdateCheck(): boolean {
    return false; // curl-tar doesn't support version checking
  }

  /**

   * Indicates whether this plugin supports README fetching.
   *
   * @returns False, as curl-tar installations don't have associated READMEs to fetch.
   */
  supportsReadme(): boolean {
    return false;
  }
}
