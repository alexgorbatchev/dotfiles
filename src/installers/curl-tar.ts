import type fsType from 'node:fs';
import type { ToolConfig, CurlTarInstallParams } from '../types';
import { createLogger } from '../utils/logger';
import { $ } from 'zx';
import path from 'node:path';
import { config as appConfig } from '../config'; // Import appConfig
import { downloadFile } from '../utils/download'; // Import downloadFile
import { extractArchive } from '../utils/archive'; // Import extractArchive

// Helper for exists check using the injected fs promises
async function fileExists(fs: typeof fsType, filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const logger = createLogger('installer:curl-tar');

/**
 * Installs a tool by downloading a tarball via curl and extracting it.
 *
 * @param toolName The name of the tool being installed.
 * @param toolConfig The tool's configuration object.
 * @param binaryName The name of the binary to install.
 * @param finalBinaryPath The expected final installation path of the binary.
 * @param currentOs The current operating system.
 * @param currentArch The current architecture.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 */
export async function installCurlTar(
  toolName: string,
  toolConfig: ToolConfig,
  binaryName: string,
  finalBinaryPath: string,
  currentOs: string,
  currentArch: string,
  fs: typeof fsType
): Promise<void> {
  logger('Starting curl-tar installation for %s...', toolName);
  const curlTarParams = toolConfig.installParams as CurlTarInstallParams;

  // Ensure zx commands are quiet unless verbose logging is on
  $.quiet = !logger.enabled;

  // Define base paths (these should align with shim.sh and config.ts)
  if (!appConfig.DOTFILES_DIR) {
    throw new Error('Error: DOTFILES_DIR is not defined in the application configuration.');
  }
  const dotfilesDir = appConfig.DOTFILES_DIR;
  const generatedDir = path.join(dotfilesDir, '.generated');
  const cacheDirForTool = path.join(generatedDir, 'cache', toolName);
  const installDirForTool = path.join(generatedDir, 'binaries', toolName);
  const binDirForTool = path.join(installDirForTool, 'bin');

  try {
    logger('Downloading tarball from: %s', curlTarParams.url);
    const downloadDest = path.join(cacheDirForTool, `${toolName}.tar.gz`); // Use a consistent name
    await downloadFile(curlTarParams.url, downloadDest, fs);
    logger('Download complete.');

    // Execute afterDownload hook (if applicable for curl-tar)
    // Note: Curl-tar doesn't have a direct Zinit equivalent for afterDownload,
    // but we can support it for consistency if needed.
    if (toolConfig.hooks?.afterDownload) {
      logger('Executing afterDownload hook...');
      await toolConfig.hooks.afterDownload({
        toolName,
        installDir: installDirForTool,
        downloadPath: downloadDest,
      });
    }

    logger('Extracting tarball from: %s', downloadDest);
    const extractDir = installDirForTool; // Extract directly into final tool version dir for now
    await extractArchive(downloadDest, extractDir, fs);
    logger('Extraction complete.');

    // Execute afterExtract hook
    if (toolConfig.hooks?.afterExtract) {
      logger('Executing afterExtract hook...');
      await toolConfig.hooks.afterExtract({
        toolName,
        installDir: installDirForTool,
        downloadPath: downloadDest,
        extractDir,
      });
    }

    // Locate and move/rename binary
    // --- Binary Locating/Moving Logic --- START ---
    let sourceBinaryPath: string | null = null;
    let targetBinaryName = binaryName;

    if (curlTarParams.extractPath) {
      const potentialPath = path.join(extractDir, curlTarParams.extractPath);
      if (await fileExists(fs, potentialPath)) {
        sourceBinaryPath = potentialPath;
        logger('Located binary using extractPath: %s', sourceBinaryPath);
      } else {
        logger(
          'Warning: extractPath specified (%s), but file not found at %s',
          curlTarParams.extractPath,
          potentialPath
        );
        // TODO: List files in extractDir for debugging?
      }
    } else if (curlTarParams.moveBinaryTo) {
      const [sourcePattern, targetNameFromMv] = curlTarParams.moveBinaryTo
        .split('->')
        .map((s) => s.trim());
      if (!sourcePattern || !targetNameFromMv) {
        throw new Error(
          `Invalid moveBinaryTo format: "${curlTarParams.moveBinaryTo}". Expected "source -> target".`
        );
      }
      targetBinaryName = targetNameFromMv;
      logger('Locating binary using move pattern: %s in %s', sourcePattern, extractDir);

      // Convert wildcard pattern to regex for matching
      const regexPattern = sourcePattern.replace(/\*/g, '.*');
      const regex = new RegExp(regexPattern);

      // Find files in the extracted directory that match the pattern
      const files = await fs.promises.readdir(extractDir, { recursive: true });
      const matchingFiles = files.filter((file) => regex.test(file as string)); // Explicitly cast to string

      if (matchingFiles.length > 0) {
        // Assuming the first match is the correct binary
        sourceBinaryPath = path.join(extractDir, matchingFiles[0] as string); // Explicitly cast to string
        logger(
          'Located binary using move pattern: %s (matched %s)',
          sourceBinaryPath,
          matchingFiles[0]
        );
      } else {
        logger(
          'Warning: moveBinaryTo specified, but could not find match for %s in %s',
          sourcePattern,
          extractDir
        );
        // TODO: List files in extractDir for debugging?
      }
    } else {
      // Default search logic (no 'extractPath' or 'moveBinaryTo')
      // Look for the binary named `binaryName` directly in `extractDir` or `extractDir/bin`
      const potentialPaths = [
        path.join(extractDir, binaryName),
        path.join(extractDir, 'bin', binaryName),
      ];
      for (const potentialPath of potentialPaths) {
        if (await fileExists(fs, potentialPath)) {
          sourceBinaryPath = potentialPath;
          logger('Located binary using default search: %s', sourceBinaryPath);
          break;
        }
      }
    }

    if (!sourceBinaryPath) {
      logger('Could not locate binary for %s within extracted files at %s', toolName, extractDir);
      // List files in extractDir for debugging
      try {
        const extractedFiles = await fs.promises.readdir(extractDir, { recursive: true });
        logger('Files found in extracted directory (%s): %o', extractDir, extractedFiles);
      } catch (listError) {
        logger('Failed to list files in extracted directory %s: %o', extractDir, listError);
      }
      throw new Error(
        `Could not locate binary for ${toolName} within extracted files at ${extractDir}`
      );
    }

    const finalTargetPath = path.join(binDirForTool, targetBinaryName);

    // Ensure final bin directory exists
    await fs.promises.mkdir(binDirForTool, { recursive: true });

    // Move the located binary to the final destination
    logger('Moving %s to %s', sourceBinaryPath, finalTargetPath);
    await fs.promises.rename(sourceBinaryPath, finalTargetPath);
    // --- Binary Locating/Moving Logic --- END ---

    // Handle completions if specified for curl-tar
    // Note: Curl-tar doesn't have a direct Zinit equivalent for completions,
    // but we can support it for consistency if needed.
    if (curlTarParams.completions) {
      const sourceCompPath = path.join(extractDir, curlTarParams.completions);
      const targetCompDir = path.join(appConfig.GENERATED_DIR, 'zsh', 'completions');
      await fs.promises.mkdir(targetCompDir, { recursive: true });
      const targetCompPath = path.join(targetCompDir, path.basename(curlTarParams.completions));

      if (await fileExists(fs, sourceCompPath)) {
        await fs.promises.copyFile(sourceCompPath, targetCompPath);
        logger('Copied completion file %s to %s', sourceCompPath, targetCompPath);
      } else {
        logger(
          'Warning: Completion file specified (%s) but not found at %s',
          curlTarParams.completions,
          sourceCompPath
        );
        // List files in extractDir for debugging
        try {
          const extractedFiles = await fs.promises.readdir(extractDir, { recursive: true });
          logger('Files found in extracted directory (%s): %o', extractDir, extractedFiles);
        } catch (listError) {
          logger('Failed to list files in extracted directory %s: %o', extractDir, listError);
        }
      }
    }

    logger('Curl-tar installation complete.');

    // Verify installation by checking if the binary exists at finalBinaryPath
    // Note: This check might need refinement if the binary is not directly in a standard PATH location.
    // For now, we rely on the check in install-tool.ts after the installer runs,
    // but this adds an extra layer of verification within the installer itself.
    if (!(await fileExists(fs, finalBinaryPath))) {
      logger(
        'Warning: Curl-tar installation reported success, but binary not found at expected path: %s',
        finalBinaryPath
      );
      // We don't throw here because the check in install-tool.ts is the primary verification.
      // This is just an informative warning within the installer.
    } else {
      logger('Binary found at expected path after Curl-tar installation: %s', finalBinaryPath);
    }
  } catch (error: any) {
    logger('Curl-tar installation failed for %s: %o', toolName, error);
    const errorMessage =
      error.stderr || error.stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `Failed to install ${toolName} using curl-tar. Exit code: ${error.exitCode}. Error: ${errorMessage}`
    );
  }
}
