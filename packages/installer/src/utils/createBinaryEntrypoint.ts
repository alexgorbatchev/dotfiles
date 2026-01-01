import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';

import { messages } from './log-messages';

export async function createBinaryEntrypoint(
  fs: IFileSystem,
  toolName: string,
  binaryName: string,
  timestamp: string,
  binaryPath: string,
  binariesDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'createBinaryEntrypoint' });
  const toolDir = path.join(binariesDir, toolName);
  const timestampedDir = path.join(toolDir, timestamp);
  const entrypointPath = path.join(timestampedDir, binaryName);
  const actualBinaryPath = path.join(timestampedDir, binaryPath);

  if (actualBinaryPath === entrypointPath) {
    return;
  }

  if (!(await fs.exists(actualBinaryPath))) {
    const errorMsg = `Cannot create entrypoint: target binary does not exist at ${actualBinaryPath}`;
    logger.error(messages.binarySymlink.targetBinaryMissing(toolName, binaryName, actualBinaryPath));
    throw new Error(errorMsg);
  }

  await fs.ensureDir(timestampedDir);

  try {
    if (await fs.exists(entrypointPath)) {
      logger.debug(messages.binarySymlink.removingExisting(entrypointPath));
      await fs.rm(entrypointPath, { force: true });
    }
  } catch (error) {
    logger.error(messages.binarySymlink.removeExistingFailed(entrypointPath), error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to remove old entrypoint ${entrypointPath}: ${reason}`);
  }

  try {
    const targetPath = path.relative(timestampedDir, actualBinaryPath);
    logger.debug(messages.binarySymlink.creating(entrypointPath, targetPath));

    await fs.symlink(targetPath, entrypointPath);

    const entrypointStats = await fs.lstat(entrypointPath);
    if (!entrypointStats.isSymbolicLink()) {
      throw new Error('Entrypoint unexpectedly created as regular file instead of symlink');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(messages.binarySymlink.creationFailed(entrypointPath, actualBinaryPath), error);
    throw new Error(`Failed to create entrypoint at ${entrypointPath}: ${reason}`);
  }

  const didEntrypointCreate: boolean = await fs.exists(entrypointPath);
  if (!didEntrypointCreate) {
    logger.error(messages.binarySymlink.verificationFailed(entrypointPath));
    throw new Error(`Entrypoint creation appeared to succeed but file does not exist at ${entrypointPath}`);
  }

  logger.debug(messages.binarySymlink.createdAndVerified(entrypointPath, actualBinaryPath));
}

export async function createAllBinaryEntrypoints(
  fs: IFileSystem,
  toolName: string,
  binaries: string[],
  timestamp: string,
  binaryBasePath: string,
  binariesDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'createAllBinaryEntrypoints' });
  for (const binaryName of binaries) {
    const binaryPath = path.join(binaryBasePath, binaryName);
    await createBinaryEntrypoint(fs, toolName, binaryName, timestamp, binaryPath, binariesDir, logger);
  }
}
