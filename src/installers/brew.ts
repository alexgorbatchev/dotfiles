import type fsType from 'node:fs';
import type { ToolConfig, BrewInstallParams } from '../types';
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

const logger = createLogger('installer:brew');

/**
 * Installs a tool using the Homebrew method.
 *
 * @param toolName The name of the tool being installed.
 * @param toolConfig The tool's configuration object.
 * @param binaryName The name of the binary to install.
 * @param finalBinaryPath The expected final installation path of the binary.
 * @param currentOs The current operating system.
 * @param currentArch The current architecture.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 */
export async function installBrew(
  toolName: string,
  toolConfig: ToolConfig,
  binaryName: string,
  finalBinaryPath: string,
  currentOs: string,
  currentArch: string,
  fs: typeof fsType
): Promise<void> {
  logger('Starting Brew installation for %s...', toolName);
  const brewParams = toolConfig.installParams as BrewInstallParams;

  if (currentOs !== 'darwin' && currentOs !== 'linux') {
    throw new Error(
      `Brew installation is only supported on macOS and Linux. Current OS: ${currentOs}`
    );
  }

  // Ensure zx commands are quiet unless verbose logging is on
  $.quiet = !logger.enabled;

  try {
    // Tap repositories if specified
    if (brewParams.tap) {
      const taps = Array.isArray(brewParams.tap) ? brewParams.tap : [brewParams.tap];
      for (const tap of taps) {
        logger('Tapping brew repository: %s', tap);
        await $`brew tap ${tap}`;
      }
    }

    // Install the formula or cask
    if (brewParams.formula) {
      logger('Installing brew formula: %s', brewParams.formula);
      await $`brew install ${brewParams.formula}`;
    } else if (brewParams.cask) {
      // Cask name is often the same as toolName or formula, but can be specified
      const caskName = brewParams.cask === true ? toolName : String(brewParams.cask);
      logger('Installing brew cask: %s', caskName);
      await $`brew install --cask ${caskName}`;
    } else {
      throw new Error(`Brew installation requires either 'formula' or 'cask' to be specified.`);
    }

    logger('Brew installation complete.');

    // Verify installation by checking if the binary exists at finalBinaryPath
    // Note: Brew might install to different locations, so this check might need refinement
    // if the binary is not directly in a standard PATH location after brew install.
    // For now, we rely on the check in install-tool.ts after the installer runs,
    // but this adds an extra layer of verification within the installer itself.
    if (!(await fileExists(fs, finalBinaryPath))) {
      logger(
        'Warning: Brew installation reported success, but binary not found at expected path: %s',
        finalBinaryPath
      );
      // We don't throw here because the check in install-tool.ts is the primary verification.
      // This is just an informative warning within the installer.
    } else {
      logger('Binary found at expected path after Brew installation: %s', finalBinaryPath);
    }
  } catch (error: any) {
    logger('Brew installation failed for %s: %o', toolName, error);
    const errorMessage =
      error.stderr || error.stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `Failed to install ${toolName} using Brew. Exit code: ${error.exitCode}. Error: ${errorMessage}`
    );
  }
}
