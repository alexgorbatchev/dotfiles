import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IValidationResult,
  IShell,
} from "@dotfiles/core";
import { Platform } from "@dotfiles/core";
import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import type { TsLogger } from "@dotfiles/logger";
import { installFromPkg } from "./installFromPkg";
import { type IPkgInstallParams, pkgInstallParamsSchema, type PkgToolConfig, pkgToolConfigSchema } from "./schemas";
import type { IPkgInstallMetadata } from "./types";

const PLUGIN_VERSION = "1.0.0";

export class PkgInstallerPlugin implements IInstallerPlugin<
  "pkg",
  IPkgInstallParams,
  PkgToolConfig,
  IPkgInstallMetadata
> {
  readonly method = "pkg";
  readonly displayName = "PKG Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = pkgInstallParamsSchema;
  readonly toolConfigSchema = pkgToolConfigSchema;
  readonly staticValidation = true;
  readonly externallyManaged = true;
  readonly missingBinaryMessage =
    "Installation completed via macOS Installer. If the binary is not immediately available, restart your shell or configure pkg.binaryPath explicitly.";

  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor,
    private readonly shell: IShell,
    private readonly githubApiClient: IGitHubApiClient,
    private readonly ghCliApiClient: IGitHubApiClient | undefined,
  ) {}

  async validate(context: IInstallContext): Promise<IValidationResult> {
    if (context.systemInfo.platform !== Platform.MacOS) {
      return { valid: true, warnings: ["PKG installer only works on macOS"] };
    }

    try {
      await this.shell`test -x /usr/sbin/installer`.quiet();
      return { valid: true };
    } catch {
      return { valid: false, errors: ["installer not found — required for PKG installation"] };
    }
  }

  async install(
    toolName: string,
    toolConfig: PkgToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<IPkgInstallMetadata>> {
    return installFromPkg(
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
      this.githubApiClient,
      this.ghCliApiClient,
    );
  }

  supportsUpdate(): boolean {
    return false;
  }

  supportsUpdateCheck(): boolean {
    return false;
  }

  supportsReadme(): boolean {
    return false;
  }
}
