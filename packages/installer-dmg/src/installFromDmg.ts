import {
  type IDownloadContext,
  type IInstallContext,
  Platform,
  type Shell,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, IInstallOptions } from '@dotfiles/installer';
import {
  createToolFileSystem,
  downloadWithProgress,
  executeAfterDownloadHook,
  getBinaryPaths,
  withInstallErrorHandling,
} from '@dotfiles/installer';
import { normalizeBinaries } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { detectVersionViaCli } from '@dotfiles/utils';
import path from 'node:path';
import { messages } from './log-messages';
import type { DmgToolConfig } from './schemas';
import type { DmgInstallResult, IDmgInstallMetadata } from './types';

export async function installFromDmg(
  toolName: string,
  toolConfig: DmgToolConfig,
  context: IInstallContext,
  options: IInstallOptions | undefined,
  fs: IFileSystem,
  downloader: IDownloader,
  hookExecutor: HookExecutor,
  parentLogger: TsLogger,
  shellExecutor: Shell,
): Promise<DmgInstallResult> {
  const toolFs = createToolFileSystem(fs, toolName);
  const logger = parentLogger.getSubLogger({ name: 'installFromDmg' });
  logger.debug(messages.installing(toolName));

  // Platform gate: silently skip on non-macOS
  if (context.systemInfo.platform !== Platform.MacOS) {
    logger.info(messages.skippingNonMacOS(toolName));
    return {
      success: true,
      binaryPaths: [],
      metadata: { method: 'dmg', dmgUrl: toolConfig.installParams.url },
    };
  }

  const params = toolConfig.installParams;
  const url = params.url;

  const operation = async (): Promise<DmgInstallResult> => {
    // 1. Download the DMG
    logger.debug(messages.downloadingDmg(url));
    const dmgPath = path.join(context.stagingDir, `${toolName}.dmg`);
    await downloadWithProgress(logger, url, dmgPath, `${toolName}.dmg`, downloader, options);

    // 2. Run after-download hook
    const postDownloadContext: IDownloadContext = {
      ...context,
      downloadPath: dmgPath,
    };
    const afterDownloadResult = await executeAfterDownloadHook(
      toolConfig,
      postDownloadContext,
      hookExecutor,
      fs,
      logger,
    );
    if (!afterDownloadResult.success) {
      return { success: false, error: afterDownloadResult.error };
    }

    // 3. Mount the DMG
    const mountPoint = path.join(context.stagingDir, '.dmg-mount');
    await fs.ensureDir(mountPoint);
    logger.debug(messages.mountingDmg(dmgPath));
    await shellExecutor`hdiutil attach -nobrowse -noautoopen -mountpoint ${mountPoint} ${dmgPath}`.quiet();
    logger.debug(messages.dmgMounted(mountPoint));

    let appName: string;
    try {
      // 4. Find the .app bundle
      const resolvedAppName = await findAppBundle(params.appName, mountPoint, fs, logger);
      if (!resolvedAppName) {
        return { success: false, error: 'No .app bundle found in DMG' };
      }
      appName = resolvedAppName;

      // 5. Copy the .app to staging dir
      const appSource = path.join(mountPoint, appName);
      const appDest = path.join(context.stagingDir, appName);
      logger.debug(messages.copyingApp(appName));
      await shellExecutor`cp -R ${appSource} ${appDest}`.quiet();

      // 6. Symlink binaries from Contents/MacOS/ to stagingDir
      const binaries = normalizeBinaries(toolConfig.binaries);
      for (const binary of binaries) {
        const binarySource = params.binaryPath
          ? path.join(appDest, params.binaryPath)
          : path.join(appDest, 'Contents', 'MacOS', binary.name);
        const binaryDest = path.join(context.stagingDir, binary.name);
        logger.debug(messages.symlinkingBinary(binarySource, binaryDest));
        await fs.symlink(binarySource, binaryDest);
      }
    } finally {
      // 7. Always unmount
      logger.debug(messages.unmountingDmg(mountPoint));
      await shellExecutor`hdiutil detach ${mountPoint}`.quiet().noThrow();
    }

    // 8. Clean up downloaded DMG
    if (await toolFs.exists(dmgPath)) {
      await toolFs.rm(dmgPath);
    }

    // 9. Resolve binary paths and detect version
    const binaryPaths = getBinaryPaths(toolConfig.binaries, context.stagingDir);

    let detectedVersion: string | undefined;
    const mainBinaryPath = binaryPaths[0];
    if (mainBinaryPath) {
      detectedVersion = await detectVersionViaCli({
        binaryPath: mainBinaryPath,
        args: params.versionArgs,
        regex: params.versionRegex,
        shellExecutor,
      });
    }

    const metadata: IDmgInstallMetadata = {
      method: 'dmg',
      downloadUrl: url,
      dmgUrl: url,
    };

    return {
      success: true,
      binaryPaths,
      metadata,
      version: detectedVersion || (toolConfig.version !== 'latest' ? toolConfig.version : undefined),
    };
  };

  return withInstallErrorHandling('dmg', toolName, logger, operation);
}

async function findAppBundle(
  appName: string | undefined,
  mountPoint: string,
  fs: IFileSystem,
  logger: TsLogger,
): Promise<string | null> {
  if (appName) return appName;

  const entries = await fs.readdir(mountPoint);
  const appEntry = entries.find((e) => e.endsWith('.app'));
  if (!appEntry) {
    logger.error(messages.appNotFound(mountPoint));
    return null;
  }
  return appEntry;
}
