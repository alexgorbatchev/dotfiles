import path from 'node:path';
import type fsType from 'node:fs';
import type { ToolConfig, GithubReleaseInstallParams } from '../types';
import { createLogger } from '../utils/logger';
import { config as appConfig } from '../config';
import { GitHubApiClient, type GitHubRelease, type GitHubAsset } from '../utils/github-api';
import { downloadFile } from '../utils/download';
import { extractArchive } from '../utils/archive';

const logger = createLogger('installer:github-release');

// Helper for exists check using the injected fs promises
async function fileExists(fs: typeof fsType, filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs a tool using the GitHub release method.
 *
 * @param toolName The name of the tool being installed.
 * @param toolConfig The tool's configuration object.
 * @param binaryName The name of the binary to install.
 * @param finalBinaryPath The expected final installation path of the binary.
 * @param currentOs The current operating system.
 * @param currentArch The current architecture.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 * @param apiClient The GitHub API client instance.
 */
export async function installGithubRelease(
  toolName: string,
  toolConfig: ToolConfig,
  binaryName: string,
  finalBinaryPath: string,
  currentOs: string,
  currentArch: string,
  fs: typeof fsType,
  apiClient: GitHubApiClient
): Promise<void> {
  logger('Starting GitHub release installation for %s...', toolName);
  const ghParams = toolConfig.installParams as GithubReleaseInstallParams;
  const currentOsArch = `${currentOs}-${currentArch}`;

  // 1. Determine target release
  let releaseData: GitHubRelease;
  const versionToInstall = toolConfig.version === 'latest' ? 'latest' : toolConfig.version;
  logger('Fetching release %s for %s', versionToInstall, ghParams.repo);
  if (versionToInstall === 'latest') {
    releaseData = await apiClient.getLatestRelease(ghParams.repo);
  } else {
    releaseData = await apiClient.getReleaseByTag(ghParams.repo, versionToInstall);
  }

  if (!releaseData || !releaseData.assets || releaseData.assets.length === 0) {
    throw new Error(`No release data or assets found for ${ghParams.repo}@${versionToInstall}`);
  }
  logger('Found release: %s (%s)', releaseData.name, releaseData.tag_name);

  // 2. Find matching asset
  // --- Asset Selection Logic --- START ---
  logger('Finding asset for %s...', currentOsArch);
  const assets: GitHubAsset[] = releaseData.assets;
  let selectedAsset: GitHubAsset | null = null;

  const platform = currentOs === 'darwin' ? 'apple-darwin' : 'unknown-linux-gnu';
  const arch = currentArch === 'arm64' ? 'aarch64' : 'x86_64';

  if (ghParams.assetPattern) {
    const pattern = ghParams.assetPattern
      .replace('{arch}', arch)
      .replace('{platform}', platform)
      .replace('{os}', currentOs);
    logger('Using asset pattern: %s', pattern);
    // Convert wildcard pattern to regex for more robust matching
    const regexPattern = pattern.replace(/\*/g, '.*');
    const regex = new RegExp(regexPattern);
    selectedAsset = assets.find((a) => regex.test(a.name)) ?? null;
  } else {
    logger('No asset pattern provided, using default matching logic...');
    const commonPatterns = [
      `${arch}-${platform}`,
      `${currentOs}-${arch}`,
      platform,
      currentOs,
      arch,
    ];
    for (const p of commonPatterns) {
      selectedAsset = assets.find((a) => a.name.toLowerCase().includes(p.toLowerCase())) ?? null;
      if (selectedAsset) {
        logger(
          'Found potential asset using default pattern: %s (matched in %s)',
          p,
          selectedAsset.name
        );
        break;
      }
    }
    if (!selectedAsset && assets.length > 0) {
      const archiveAsset =
        assets.find((a) => a.name.endsWith('.tar.gz') || a.name.endsWith('.zip')) ?? null;
      if (archiveAsset) {
        selectedAsset = archiveAsset;
        logger(
          'Could not find specific asset match, falling back to first common archive type: %s',
          selectedAsset.name
        );
      } else {
        selectedAsset = assets[0];
        logger(
          'Could not find specific asset match or common archive, falling back to first asset: %s',
          selectedAsset!.name
        );
      }
    }
  }

  if (!selectedAsset) {
    logger(
      'Available assets: %o',
      assets.map((a) => a.name)
    );
    throw new Error(
      `Could not find any suitable asset for ${ghParams.repo}@${versionToInstall} for ${currentOsArch}`
    );
  }
  // --- Asset Selection Logic --- END ---

  const assetUrl = selectedAsset.browser_download_url;
  const assetFilename = selectedAsset.name;
  logger('Selected asset: %s (%s)', assetFilename, assetUrl);

  // Define base paths (these should align with shim.sh and config.ts)
  if (!appConfig.DOTFILES_DIR) {
    throw new Error('Error: DOTFILES_DIR is not defined in the application configuration.');
  }
  const dotfilesDir = appConfig.DOTFILES_DIR;
  const generatedDir = path.join(dotfilesDir, '.generated');
  const cacheDirForTool = path.join(generatedDir, 'cache', toolName);
  const installDirForTool = path.join(generatedDir, 'binaries', toolName);
  const binDirForTool = path.join(installDirForTool, 'bin');

  // 3. Download asset
  const downloadDest = path.join(cacheDirForTool, assetFilename);
  logger('Downloading %s to %s...', assetUrl, downloadDest);
  await downloadFile(assetUrl, downloadDest, fs);
  logger('Download complete.');

  // 4. Execute afterDownload hook
  if (toolConfig.hooks?.afterDownload) {
    logger('Executing afterDownload hook...');
    await toolConfig.hooks.afterDownload({
      toolName,
      installDir: installDirForTool,
      downloadPath: downloadDest,
    });
  }

  // 5. Extract asset
  const extractDir = installDirForTool;
  logger('Extracting %s to %s...', downloadDest, extractDir);
  await extractArchive(downloadDest, extractDir, fs);
  logger('Extraction complete.');

  // 6. Execute afterExtract hook
  if (toolConfig.hooks?.afterExtract) {
    logger('Executing afterExtract hook...');
    await toolConfig.hooks.afterExtract({
      toolName,
      installDir: installDirForTool,
      downloadPath: downloadDest,
      extractDir,
    });
  }

  // 7. Locate and move/rename binary
  // --- Binary Locating/Moving Logic --- START ---
  let sourceBinaryPath: string | null = null;
  let targetBinaryName = binaryName;

  if (ghParams.binaryPath) {
    const potentialPath = path.join(extractDir, ghParams.binaryPath);
    if (await fileExists(fs, potentialPath)) {
      sourceBinaryPath = potentialPath;
      logger('Located binary using binaryPath: %s', sourceBinaryPath);
    } else {
      logger(
        'Warning: binaryPath specified (%s), but file not found at %s',
        ghParams.binaryPath,
        potentialPath
      );
      // TODO: List files in extractDir for debugging?
    }
  } else if (ghParams.moveBinaryTo) {
    const [sourcePattern, targetNameFromMv] = ghParams.moveBinaryTo
      .split('->')
      .map((s) => s.trim());
    if (!sourcePattern || !targetNameFromMv) {
      throw new Error(
        `Invalid moveBinaryTo format: "${ghParams.moveBinaryTo}". Expected "source -> target".`
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
    // Default search logic (no 'pick' or 'mv')
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

  // 8. Handle completions
  // --- Completion Handling Logic --- START ---
  if (ghParams.completions) {
    const sourceCompPath = path.join(extractDir, ghParams.completions);
    const targetCompDir = path.join(appConfig.GENERATED_DIR, 'zsh', 'completions');
    await fs.promises.mkdir(targetCompDir, { recursive: true });
    const targetCompPath = path.join(targetCompDir, path.basename(ghParams.completions));

    if (await fileExists(fs, sourceCompPath)) {
      await fs.promises.copyFile(sourceCompPath, targetCompPath);
      logger('Copied completion file %s to %s', sourceCompPath, targetCompPath);
    } else {
      logger(
        'Warning: Completion file specified (%s) but not found at %s',
        ghParams.completions,
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
  // --- Completion Handling Logic --- END ---
}
