import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IValidationResult,
  Shell,
} from '@dotfiles/core';
import { Platform } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGitHubApiClient } from '@dotfiles/installer-github';
import type { HookExecutor } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { installFromDmg } from './installFromDmg';
import {
  type DmgInstallParams,
  dmgInstallParamsSchema,
  type DmgToolConfig,
  dmgToolConfigSchema,
} from './schemas';
import type { IDmgInstallMetadata } from './types';

const PLUGIN_VERSION = '1.0.0';

/**
 * Installer plugin for macOS applications distributed as DMG disk images.
 *
 * This plugin downloads a .dmg file, mounts it, copies the .app bundle to
 * /Applications, and resolves binaries from Contents/MacOS/ for
 * system-wide availability.
 *
 * On non-macOS platforms, installation is silently skipped with a success result.
 */
export class DmgInstallerPlugin
  implements IInstallerPlugin<'dmg', DmgInstallParams, DmgToolConfig, IDmgInstallMetadata>
{
  readonly method = 'dmg';
  readonly displayName = 'DMG Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = dmgInstallParamsSchema;
  readonly toolConfigSchema = dmgToolConfigSchema;
  readonly staticValidation = true;
  readonly externallyManaged = true;
  readonly missingBinaryMessage =
    'Installation completed. This tool was installed as a macOS app bundle in /Applications. Launch it from Spotlight, Launchpad, or the Applications folder.';

  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor,
    private readonly shell: Shell,
    private readonly githubApiClient: IGitHubApiClient,
    private readonly ghCliApiClient: IGitHubApiClient | undefined,
  ) {}

  async validate(context: IInstallContext): Promise<IValidationResult> {
    // On non-macOS, return valid — the install() method handles the silent skip
    if (context.systemInfo.platform !== Platform.MacOS) {
      return { valid: true, warnings: ['DMG installer only works on macOS'] };
    }

    // On macOS, verify hdiutil exists
    try {
      await this.shell`which hdiutil`.quiet();
      return { valid: true };
    } catch {
      return { valid: false, errors: ['hdiutil not found — required for DMG installation'] };
    }
  }

  async install(
    toolName: string,
    toolConfig: DmgToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<IDmgInstallMetadata>> {
    return installFromDmg(
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
