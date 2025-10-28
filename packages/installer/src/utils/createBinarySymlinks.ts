import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';

/**
 * Create or update a symlink for a binary
 *
 * @param fs File system interface
 * @param toolName Name of the tool
 * @param binaryName Name of the binary
 * @param timestamp Installation timestamp
 * @param binaryPath Path to the binary within the timestamped directory
 * @param binariesDir Root binaries directory
 * @param logger Logger instance
 */
export async function createBinarySymlink(
  fs: IFileSystem,
  toolName: string,
  binaryName: string,
  timestamp: string,
  binaryPath: string,
  binariesDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'createBinarySymlink' });
  const toolDir = path.join(binariesDir, toolName);
  const symlinkPath = path.join(toolDir, binaryName);
  const timestampedDir = path.join(toolDir, timestamp);
  const actualBinaryPath = path.join(timestampedDir, binaryPath);

  // Verify the target binary exists before creating symlink
  if (!(await fs.exists(actualBinaryPath))) {
    const errorMsg = `Cannot create symlink: target binary does not exist at ${actualBinaryPath}`;
    logger.error(messages.binarySymlink.targetBinaryMissing(toolName, binaryName, actualBinaryPath));
    throw new Error(errorMsg);
  }

  // Create relative path from symlink to actual binary
  const targetPath = path.relative(toolDir, actualBinaryPath);

  // Ensure tool directory exists
  await fs.ensureDir(toolDir);

  // Remove existing symlink if it exists
  try {
    if (await fs.exists(symlinkPath)) {
      logger.debug(messages.binarySymlink.removingExisting(symlinkPath));
      await fs.rm(symlinkPath, { force: true });
    }
  } catch (error) {
    logger.error(messages.binarySymlink.removeExistingFailed(symlinkPath), error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to remove old symlink ${symlinkPath}: ${reason}`);
  }

  // Create new symlink
  try {
    logger.debug(messages.binarySymlink.creating(symlinkPath, targetPath));
    await fs.symlink(targetPath, symlinkPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const errorMsg = `Failed to create symlink from ${symlinkPath} to ${targetPath}: ${reason}`;
    logger.error(messages.binarySymlink.creationFailed(symlinkPath, targetPath), error);
    throw new Error(errorMsg);
  }

  // Verify symlink was created successfully
  if (!(await fs.exists(symlinkPath))) {
    const errorMsg = `Symlink creation appeared to succeed but symlink does not exist at ${symlinkPath}`;
    logger.error(messages.binarySymlink.verificationFailed(symlinkPath));
    throw new Error(errorMsg);
  }

  // Verify symlink points to the correct target
  try {
    const linkTarget = await fs.readlink(symlinkPath);
    if (linkTarget !== targetPath) {
      const errorMsg = `Symlink points to wrong target. Expected: ${targetPath}, Actual: ${linkTarget}`;
      logger.error(messages.binarySymlink.verificationMismatch(symlinkPath, targetPath, linkTarget));
      throw new Error(errorMsg);
    }
  } catch (error) {
    const errorMsg = `Failed to verify symlink target at ${symlinkPath}: ${error}`;
    logger.error(messages.binarySymlink.verificationFailed(symlinkPath), error);
    throw new Error(errorMsg);
  }

  logger.debug(messages.binarySymlink.createdAndVerified(symlinkPath, targetPath));
}

/**
 * Create symlinks for all binaries defined in tool configuration
 *
 * @param fs File system interface
 * @param toolName Name of the tool
 * @param binaries Array of binary names from tool config
 * @param timestamp Installation timestamp
 * @param binaryBasePath Base path where binaries are located within timestamped directory
 * @param binariesDir Root binaries directory
 * @param logger Logger instance
 */
export async function createAllBinarySymlinks(
  fs: IFileSystem,
  toolName: string,
  binaries: string[],
  timestamp: string,
  binaryBasePath: string,
  binariesDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'createAllBinarySymlinks' });
  for (const binaryName of binaries) {
    const binaryPath = path.join(binaryBasePath, binaryName);
    await createBinarySymlink(fs, toolName, binaryName, timestamp, binaryPath, binariesDir, logger);
  }
}
