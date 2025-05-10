import type fsType from 'node:fs';
import type { ToolConfig, ManualInstallParams } from '../types';
import { createLogger } from '../utils/logger';
import path from 'node:path'; // Import path
import fs from 'node:fs/promises'; // Import fs promises

// Helper for exists check using the injected fs promises
async function fileExists(fs: typeof fsType, filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const logger = createLogger('installer:manual');

/**
 * Handles manual tool installations.
 *
 * @param toolName The name of the tool being installed.
 * @param toolConfig The tool's configuration object.
 * @param binaryName The name of the binary to install.
 * @param finalBinaryPath The expected final installation path of the binary.
 * @param currentOs The current operating system.
 * @param currentArch The current architecture.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 */
export async function installManual(
  toolName: string,
  toolConfig: ToolConfig,
  binaryName: string,
  finalBinaryPath: string,
  currentOs: string,
  currentArch: string,
  fs: typeof fsType
): Promise<void> {
  logger('Handling manual installation for %s...', toolName);
  const manualParams = toolConfig.installParams as ManualInstallParams;

  // For manual installations, we just need to verify that the binary exists
  // at the specified path. The user is responsible for placing it there.
  if (!(await fileExists(fs, manualParams.binaryPath))) {
    throw new Error(
      `Manual installation configured, but binary not found at specified path: ${manualParams.binaryPath}`
    );
  }

  logger(`Manual binary found at: ${manualParams.binaryPath}`);

  // Create a symlink from the expected final binary path to the user-provided manual binary path.
  logger('Creating symlink from %s to %s', manualParams.binaryPath, finalBinaryPath);

  // Ensure the target directory for the symlink exists
  // Added empty options object and empty callback to satisfy type definition
  await fs.mkdir(path.dirname(finalBinaryPath), {}, () => {});

  // Remove existing target if it exists
  try {
    // Added empty callback to satisfy type definition
    await fs.unlink(finalBinaryPath, () => {});
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      logger('Error removing existing symlink target %s: %o', finalBinaryPath, error);
      throw error;
    }
  }

  // Create the symlink
  // Added type 'file' and empty callback to satisfy type definition
  await fs.symlink(manualParams.binaryPath, finalBinaryPath, 'file', () => {});
  logger('Created symlink: %s -> %s', manualParams.binaryPath, finalBinaryPath);

  logger('Manual installation complete.');
}
