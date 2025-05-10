import type fsType from 'node:fs';
import type { ToolConfig, PipInstallParams } from '../types';
import { createLogger } from '../utils/logger';
import { $ } from 'zx';

// Helper for exists check using the injected fs promises
async function fileExists(fs: typeof fsType, filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const logger = createLogger('installer:pip');

/**
 * Installs a tool using the pip method.
 *
 * @param toolName The name of the tool being installed.
 * @param toolConfig The tool's configuration object.
 * @param binaryName The name of the binary to install.
 * @param finalBinaryPath The expected final installation path of the binary.
 * @param currentOs The current operating system.
 * @param currentArch The current architecture.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 */
export async function installPip(
  toolName: string,
  toolConfig: ToolConfig,
  binaryName: string,
  finalBinaryPath: string,
  currentOs: string,
  currentArch: string,
  fs: typeof fsType
): Promise<void> {
  logger('Starting Pip installation for %s...', toolName);
  const pipParams = toolConfig.installParams as PipInstallParams;

  // Ensure zx commands are quiet unless verbose logging is on
  $.quiet = !logger.enabled;

  try {
    logger('Installing pip package: %s', pipParams.packageName);
    // Use zx to run the pip install command
    // Assuming 'pip' is available in the environment's PATH
    await $`pip install ${pipParams.packageName}`;

    logger('Pip installation complete.');

    // Verify installation by checking if the binary exists at finalBinaryPath
    // Note: Pip might install to different locations, so this check might need refinement
    // if the binary is not directly in a standard PATH location after pip install.
    // For now, we rely on the check in install-tool.ts after the installer runs,
    // but this adds an extra layer of verification within the installer itself.
    if (!(await fileExists(fs, finalBinaryPath))) {
      logger(
        'Warning: Pip installation reported success, but binary not found at expected path: %s',
        finalBinaryPath
      );
      // We don't throw here because the check in install-tool.ts is the primary verification.
      // This is just an informative warning within the installer.
    } else {
      logger('Binary found at expected path after Pip installation: %s', finalBinaryPath);
    }
  } catch (error: any) {
    logger('Pip installation failed for %s: %o', toolName, error);
    const errorMessage =
      error.stderr || error.stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `Failed to install ${toolName} using Pip. Exit code: ${error.exitCode}. Error: ${errorMessage}`
    );
  }
}
