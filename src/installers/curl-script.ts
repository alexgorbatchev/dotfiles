import type fsType from 'node:fs';
import type { ToolConfig, CurlScriptInstallParams } from '../types';
import { createLogger } from '../utils/logger';
import { $ } from 'zx';

const logger = createLogger('installer:curl-script');

/**
 * Installs a tool by downloading and executing a script via curl.
 *
 * @param toolName The name of the tool being installed.
 * @param toolConfig The tool's configuration object.
 * @param binaryName The name of the binary to install.
 * @param finalBinaryPath The expected final installation path of the binary.
 * @param currentOs The current operating system.
 * @param currentArch The current architecture.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 */
export async function installCurlScript(
  toolName: string,
  toolConfig: ToolConfig,
  binaryName: string,
  finalBinaryPath: string,
  currentOs: string,
  currentArch: string,
  fs: typeof fsType
): Promise<void> {
  logger('Starting curl-script installation for %s...', toolName);
  const curlScriptParams = toolConfig.installParams as CurlScriptInstallParams;

  // Ensure zx commands are quiet unless verbose logging is on
  $.quiet = !logger.enabled;

  try {
    logger('Downloading and executing script from: %s', curlScriptParams.url);
    // Use zx to pipe curl output to the specified shell
    await $`curl -fsSL ${curlScriptParams.url} | ${curlScriptParams.shell}`;

    logger('Curl-script installation complete.');

    // TODO: Verify installation by checking if the binary exists at finalBinaryPath
    // This might require finding the actual installation path after the script runs.
    // For now, we rely on the check in install-tool.ts after the installer runs.
  } catch (error: any) {
    logger('Curl-script installation failed for %s: %o', toolName, error);
    const errorMessage =
      error.stderr || error.stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `Failed to install ${toolName} using curl-script. Exit code: ${error.exitCode}. Error: ${errorMessage}`
    );
  }
}
