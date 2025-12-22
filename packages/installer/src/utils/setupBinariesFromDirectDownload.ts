import path from 'node:path';
import type { IInstallContext, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { createBinaryEntrypoint } from './createBinaryEntrypoint';
import { messages } from './log-messages';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Setup binaries from direct download - handles all binaries in toolConfig.binaries[]
 */
export async function setupBinariesFromDirectDownload(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  context: IInstallContext,
  downloadPath: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'setupBinariesFromDirectDownload' });
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);
  const primaryBinary = binaryConfigs[0]?.name || toolName;

  await fs.chmod(downloadPath, 0o755);

  const binariesDir = path.join(context.projectConfig.paths.generatedDir, 'binaries');
  const downloadFileName = path.basename(downloadPath);

  // Extract subdirectory name from context.installDir
  // This will be either a version (e.g., "1.0.0") or timestamp (e.g., "2025-11-04-20-53-47")
  const subdirName = path.basename(context.installDir);

  await createBinaryEntrypoint(fs, toolName, primaryBinary, subdirName, downloadFileName, binariesDir, logger);

  if (binaryConfigs.length > 1) {
    logger.debug(messages.binarySetupService.directDownloadSingleBinary(binaryConfigs.length, primaryBinary));
  }
}
