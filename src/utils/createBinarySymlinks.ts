import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';

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
  logger: TsLogger
): Promise<void> {
  const toolDir = path.join(binariesDir, toolName);
  const symlinkPath = path.join(toolDir, binaryName);
  const timestampedDir = path.join(toolDir, timestamp);
  const actualBinaryPath = path.join(timestampedDir, binaryPath);

  // Verify the target binary exists before creating symlink
  if (!(await fs.exists(actualBinaryPath))) {
    const errorMsg = `Cannot create symlink: target binary does not exist at ${actualBinaryPath}`;
    logger.error(logs.installer.debug.binaryNotFound(), errorMsg);
    throw new Error(errorMsg);
  }

  // Create relative path from symlink to actual binary
  const targetPath = path.relative(toolDir, actualBinaryPath);

  // Ensure tool directory exists
  await fs.ensureDir(toolDir);

  // Remove existing symlink if it exists
  try {
    if (await fs.exists(symlinkPath)) {
      await fs.rm(symlinkPath, { force: true });
      logger.debug(logs.installer.debug.removingOldSymlink(), symlinkPath);
    }
  } catch (error) {
    logger.error(logs.installer.debug.removingOldSymlink(), `Failed to remove old symlink ${symlinkPath}: ${error}`);
    throw new Error(`Failed to remove old symlink ${symlinkPath}: ${error}`);
  }

  // Create new symlink
  try {
    await fs.symlink(targetPath, symlinkPath);
    logger.debug(logs.installer.debug.creatingSymlink(), symlinkPath, targetPath);
  } catch (error) {
    const errorMsg = `Failed to create symlink from ${symlinkPath} to ${targetPath}: ${error}`;
    logger.error(logs.installer.debug.creatingSymlink(), errorMsg);
    throw new Error(errorMsg);
  }

  // Verify symlink was created successfully
  if (!(await fs.exists(symlinkPath))) {
    const errorMsg = `Symlink creation appeared to succeed but symlink does not exist at ${symlinkPath}`;
    logger.error(logs.installer.debug.creatingSymlink(), errorMsg);
    throw new Error(errorMsg);
  }

  // Verify symlink points to the correct target
  try {
    const linkTarget = await fs.readlink(symlinkPath);
    if (linkTarget !== targetPath) {
      const errorMsg = `Symlink points to wrong target. Expected: ${targetPath}, Actual: ${linkTarget}`;
      logger.error(logs.installer.debug.creatingSymlink(), errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    const errorMsg = `Failed to verify symlink target at ${symlinkPath}: ${error}`;
    logger.error(logs.installer.debug.creatingSymlink(), errorMsg);
    throw new Error(errorMsg);
  }

  logger.debug(
    logs.installer.debug.creatingSymlink(),
    `Successfully created and verified symlink: ${symlinkPath} -> ${targetPath}`
  );
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
  logger: TsLogger
): Promise<void> {
  for (const binaryName of binaries) {
    const binaryPath = path.join(binaryBasePath, binaryName);
    await createBinarySymlink(fs, toolName, binaryName, timestamp, binaryPath, binariesDir, logger);
  }
}
