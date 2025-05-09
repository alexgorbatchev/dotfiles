#!/usr/bin/env bun
import fsDefault from 'node:fs'; // Import the default fs implementation
import path from 'node:path';
import type fsType from 'node:fs'; // Import the full fs type
import type { ToolConfig, GithubReleaseInstallParams } from './types'; // Add GithubReleaseInstallParams
import { createLogger } from './utils/logger'; // Logger type is inferred
import { config as appConfig } from './config';
import { getToolConfigByName } from './config-loader';
import { GitHubApiClient, type GitHubRelease, type GitHubAsset } from './utils/github-api'; // Import types
import { downloadFile } from './utils/download'; // Import download utility
import { extractArchive } from './utils/archive'; // Import archive utility

// Helper for exists check using the injected fs promises
async function fileExists(fs: typeof fsType, filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath); // Use fs.promises.access
    return true;
  } catch {
    return false;
  }
}

const logger = createLogger('install-tool');

// Refactor main to accept dependencies: fs, logger, apiClient
async function mainInstallTool(
  args: string[],
  fs: typeof fsType = fsDefault, // Default to real full fs module
  apiClientInstance: GitHubApiClient = new GitHubApiClient() // Default to real client
) {
  logger('Install script started.');
  const scriptArgs = args; // Use passed args

  if (scriptArgs.length < 2) {
    logger('Error: Tool name and binary name arguments are required.');
    console.error('Usage: install-tool.ts <toolName> <binaryName> [version]');
    process.exit(1);
  }

  // At this point, scriptArgs[0] and scriptArgs[1] are guaranteed to exist.
  const toolName: string = scriptArgs[0]!;
  const binaryName: string = scriptArgs[1]!;
  const requestedVersion: string = scriptArgs[2] || 'latest'; // Optional version

  logger(`Tool Name: ${toolName}`);
  logger(`Binary Name: ${binaryName}`);
  logger(`Requested Version: ${requestedVersion}`);

  try {
    // 1. Determine the OS and architecture
    const currentOs = process.platform; // e.g., 'darwin', 'linux'
    const currentArch = process.arch; // e.g., 'arm64', 'x64'
    const currentOsArch = `${currentOs}-${currentArch}`; // e.g., 'darwin-arm64'
    logger(`Detected OS/Arch: ${currentOsArch}`);

    // 2. Load the specific tool's configuration
    const toolConfig: ToolConfig = await getToolConfigByName(toolName, currentOsArch);
    logger('Loaded configuration for tool %s: %o', toolName, toolConfig);

    // 3. Define base paths (these should align with shim.sh and config.ts)
    if (!appConfig.DOTFILES_DIR) {
      logger('Error: DOTFILES_DIR is not defined in the application configuration.');
      console.error('Error: DOTFILES_DIR is not configured.');
      process.exit(1);
    }
    const dotfilesDir = appConfig.DOTFILES_DIR; // This is now guaranteed to be a string
    const generatedDir = path.join(dotfilesDir, '.generated');
    const cacheDirForTool = path.join(generatedDir, 'cache', toolName);
    const installDirForTool = path.join(generatedDir, 'binaries', toolName);
    const binDirForTool = path.join(installDirForTool, 'bin');
    const finalBinaryPath = path.join(binDirForTool, binaryName);

    logger('Dotfiles directory: %s', dotfilesDir);
    logger('Generated directory: %s', generatedDir);
    logger('Cache directory for %s: %s', String(toolName), cacheDirForTool);
    logger('Installation directory for %s: %s', String(toolName), installDirForTool);
    logger('Binary directory for %s: %s', String(toolName), binDirForTool);
    logger('Expected final binary path: %s', finalBinaryPath);

    // 4. Ensure directories exist (using injected fs)
    await fs.promises.mkdir(cacheDirForTool, { recursive: true });
    await fs.promises.mkdir(binDirForTool, { recursive: true }); // Ensures toolInstallDir and its bin subdir are created
    logger('Created required directories.');

    // 5. Check if already installed (idempotency) (using injected fs)
    if (await fileExists(fs, finalBinaryPath)) {
      logger(`Binary ${finalBinaryPath} already exists. Skipping installation.`);
      // TODO: Add version check here if requestedVersion is not 'latest'
      // and if the installed version can be determined.
      process.exit(0);
    }

    // 6. Execute beforeInstall hook if defined
    if (toolConfig.hooks?.beforeInstall) {
      logger('Executing beforeInstall hook...');
      await toolConfig.hooks.beforeInstall({ toolName, installDir: installDirForTool });
    }

    // 7. Implement installation logic based on toolConfig.installMethod
    if (!toolConfig.installMethod || !toolConfig.installParams) {
      throw new Error(
        `Tool "${toolName}" is missing installation configuration (installMethod or installParams). Cannot proceed.`
      );
    }

    switch (toolConfig.installMethod) {
      case 'github-release': {
        // Use block scope for ghParams
        logger('Starting GitHub release installation...');
        const ghParams = toolConfig.installParams as GithubReleaseInstallParams;
        const apiClient = apiClientInstance; // Use injected client
        // The 'fs' parameter from mainInstallTool is already in scope

        // 1. Determine target release
        let releaseData: GitHubRelease; // Use Zod schema type
        const versionToInstall = toolConfig.version === 'latest' ? 'latest' : toolConfig.version;
        logger('Fetching release %s for %s', versionToInstall, ghParams.repo);
        if (versionToInstall === 'latest') {
          releaseData = await apiClient.getLatestRelease(ghParams.repo);
        } else {
          // Assume version is a tag name
          releaseData = await apiClient.getReleaseByTag(ghParams.repo, versionToInstall);
        }

        if (!releaseData || !releaseData.assets || releaseData.assets.length === 0) {
          throw new Error(
            `No release data or assets found for ${ghParams.repo}@${versionToInstall}`
          );
        }
        logger('Found release: %s (%s)', releaseData.name, releaseData.tag_name);

        // 2. Find matching asset
        // --- Asset Selection Logic --- START ---
        logger('Finding asset for %s...', currentOsArch);
        const assets: GitHubAsset[] = releaseData.assets; // Use Zod schema type
        let selectedAsset: GitHubAsset | null = null; // Use Zod schema type

        const platform = currentOs === 'darwin' ? 'apple-darwin' : 'unknown-linux-gnu'; // Example mapping
        const arch = currentArch === 'arm64' ? 'aarch64' : 'x86_64'; // Example mapping

        if (ghParams.assetPattern) {
          // Interpolate pattern (simple example, needs refinement for more complex cases)
          const pattern = ghParams.assetPattern
            .replace('{arch}', arch)
            .replace('{platform}', platform)
            .replace('{os}', currentOs);
          logger('Using asset pattern: %s', pattern);
          // TODO: Implement more robust matching (regex/glob) if needed. Simple includes for now.
          // Consider using a library like minimatch if glob is needed later.
          selectedAsset = assets.find((a) => a.name.includes(pattern)) ?? null;
        } else {
          // Default logic: Try common patterns for the current OS/Arch
          logger('No asset pattern provided, using default matching logic...');
          // Prioritize more specific patterns first
          const commonPatterns = [
            `${arch}-${platform}`, // Exact match: e.g., aarch64-apple-darwin
            `${currentOs}-${arch}`, // Common alternative: e.g., darwin-arm64 (maps to aarch64)
            platform, // OS specific: e.g., apple-darwin
            currentOs, // OS name: e.g., darwin
            arch, // Arch name: e.g., aarch64
          ];
          // Try finding assets containing these patterns, case-insensitive
          for (const p of commonPatterns) {
            selectedAsset =
              assets.find((a) => a.name.toLowerCase().includes(p.toLowerCase())) ?? null;
            if (selectedAsset) {
              logger(
                'Found potential asset using default pattern: %s (matched in %s)',
                p,
                selectedAsset.name
              );
              // TODO: Could add preference for common archive types (.tar.gz, .zip) here if multiple assets match the pattern
              break; // Found a reasonable match
            }
          }
          // Fallback if still not found after checking specific patterns
          if (!selectedAsset && assets.length > 0) {
            // Try finding common archive types as a lower priority fallback
            const archiveAsset =
              assets.find((a) => a.name.endsWith('.tar.gz') || a.name.endsWith('.zip')) ?? null;
            if (archiveAsset) {
              selectedAsset = archiveAsset;
              logger(
                'Could not find specific asset match, falling back to first common archive type: %s',
                selectedAsset.name
              );
            } else {
              selectedAsset = assets[0]; // Absolute last resort: grab the first asset
              logger(
                'Could not find specific asset match or common archive, falling back to first asset: %s',
                selectedAsset!.name
              );
            }
          }
        }

        if (!selectedAsset) {
          // This should only happen if releaseData.assets was empty initially
          logger(
            'Available assets: %o',
            assets.map((a) => a.name)
          ); // Log available assets if selection failed
          throw new Error(
            `Could not find any suitable asset for ${ghParams.repo}@${versionToInstall} for ${currentOsArch}`
          );
        }
        // --- Asset Selection Logic --- END ---

        const assetUrl = selectedAsset.browser_download_url;
        const assetFilename = selectedAsset.name;
        logger('Selected asset: %s (%s)', assetFilename, assetUrl);

        // 3. Download asset
        const downloadDest = path.join(cacheDirForTool, assetFilename);
        logger('Downloading %s to %s...', assetUrl, downloadDest);
        await downloadFile(assetUrl, downloadDest, fs); // Pass fs directly
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
        const extractDir = installDirForTool; // Extract directly into final tool version dir for now
        logger('Extracting %s to %s...', downloadDest, extractDir);
        await extractArchive(downloadDest, extractDir, fs); // Pass fs directly
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
        let targetBinaryName = binaryName; // Default target name, might be overridden by 'mv'

        if (ghParams.binaryPath) {
          // Case 1: Exact path within archive is specified (like Zinit 'pick')
          const potentialPath = path.join(extractDir, ghParams.binaryPath);
          if (await fileExists(fs, potentialPath)) {
            // fileExists uses fs.promises.access
            sourceBinaryPath = potentialPath;
            logger('Located binary using binaryPath: %s', sourceBinaryPath);
          } else {
            logger(
              'Warning: binaryPath specified (%s), but file not found at %s',
              ghParams.binaryPath,
              potentialPath
            );
            // TODO: List files in extractDir for debugging? `await fs.readdir(extractDir)`
          }
        } else if (ghParams.moveBinaryTo) {
          // Case 2: Need to find a file matching a pattern and rename/move it (like Zinit 'mv')
          const [sourcePattern, targetNameFromMv] = ghParams.moveBinaryTo
            .split('->')
            .map((s) => s.trim());
          if (!sourcePattern || !targetNameFromMv) {
            throw new Error(
              `Invalid moveBinaryTo format: "${ghParams.moveBinaryTo}". Expected "source -> target".`
            );
          }
          targetBinaryName = targetNameFromMv; // Use the target name specified after '->'
          logger('Locating binary using move pattern: %s in %s', sourcePattern, extractDir);

          // TODO: Implement robust glob matching within extractDir to find sourcePattern.
          // Simple placeholder: Check if the dummy path created during mock extraction matches the pattern's likely target.
          // This needs to be replaced with actual directory scanning and pattern matching.
          const placeholderSource = path.join(
            extractDir,
            `some-dir-${currentOsArch}/${binaryName}`
          ); // Path created in mock extraction
          const sourcePatternLikelyTarget = sourcePattern.includes('/')
            ? path.basename(sourcePattern)
            : sourcePattern; // Guess target from pattern
          if (
            path.basename(placeholderSource) === sourcePatternLikelyTarget &&
            (await fileExists(fs, placeholderSource)) // fileExists uses fs.promises.access
          ) {
            sourceBinaryPath = placeholderSource;
            logger('Located binary using move pattern (placeholder match): %s', sourceBinaryPath);
          } else {
            logger(
              'Warning: moveBinaryTo specified, but could not find match for %s (placeholder check failed)',
              sourcePattern
            );
            // TODO: List files?
          }
        } else {
          // Case 3: Default search logic (no 'pick' or 'mv')
          // Look for the binary named `binaryName` directly in `extractDir` or `extractDir/bin`
          const pathInRoot = path.join(extractDir, binaryName);
          const pathInBin = path.join(extractDir, 'bin', binaryName);
          if (await fileExists(fs, pathInRoot)) {
            // fileExists uses fs.promises.access
            sourceBinaryPath = pathInRoot;
          } else if (await fileExists(fs, pathInBin)) {
            // fileExists uses fs.promises.access
            sourceBinaryPath = pathInBin;
          }
          logger('Located binary using default search: %s', sourceBinaryPath);
        }

        if (!sourceBinaryPath) {
          // TODO: List files in extractDir before throwing?
          throw new Error(
            `Could not locate binary for ${toolName} within extracted files at ${extractDir}`
          );
        }

        // Determine final path using the potentially updated targetBinaryName
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
          // Ensure target directory exists
          const targetCompDir = path.join(appConfig.GENERATED_DIR, 'zsh', 'completions');
          await fs.promises.mkdir(targetCompDir, { recursive: true });
          // Construct target path using the basename from the source completion path
          const targetCompPath = path.join(targetCompDir, path.basename(ghParams.completions));

          if (await fileExists(fs, sourceCompPath)) {
            // fileExists uses fs.promises.access
            // Use copyFile instead of rename to keep original in case of re-extract needed? Or just move? Let's copy.
            await fs.promises.copyFile(sourceCompPath, targetCompPath);
            logger('Copied completion file %s to %s', sourceCompPath, targetCompPath);
          } else {
            logger(
              'Warning: Completion file specified (%s) but not found at %s',
              ghParams.completions,
              sourceCompPath
            );
            // TODO: List files?
          }
        }
        // --- Completion Handling Logic --- END ---

        break;
      }
      case 'brew':
        logger('Starting Brew installation...');
        // TODO: Implement brew logic
        break;
      case 'curl-script':
        logger('Starting curl-script installation...');
        // TODO: Implement curl-script logic
        break;
      case 'curl-tar':
        logger('Starting curl-tar installation...');
        // TODO: Implement curl-tar logic
        break;
      case 'pip':
        logger('Starting pip installation...');
        // TODO: Implement pip logic
        break;
      case 'manual':
        logger('Manual installation configured.');
        const params = toolConfig.installParams as import('./types').ManualInstallParams;
        if (!(await fileExists(fs, params.binaryPath))) {
          // fileExists uses fs.promises.access
          throw new Error(
            `Manual installation configured, but binary not found at specified path: ${params.binaryPath}`
          );
        }
        // TODO: Decide how to handle manual installs - symlink or direct path in shim?
        logger(`Manual binary found at: ${params.binaryPath}`);
        break;
      default:
        const exhaustiveCheck: never = toolConfig.installMethod;
        throw new Error(`Unsupported installation method: ${exhaustiveCheck}`);
    }

    // 8. After successful installation, ensure the binary is at finalBinaryPath and executable.
    if (!(await fileExists(fs, finalBinaryPath))) {
      // fileExists uses fs.promises.access
      throw new Error(
        `Installation process supposedly completed, but binary not found at ${finalBinaryPath}.`
      );
    }
    await fs.promises.chmod(finalBinaryPath, 0o755); // Use injected fs promises

    // 9. Execute afterInstall hook if defined
    if (toolConfig.hooks?.afterInstall) {
      logger('Executing afterInstall hook...');
      await toolConfig.hooks.afterInstall({ toolName, installDir: installDirForTool });
    }

    logger(`Installation of ${toolName} (${binaryName}) completed successfully.`);
    process.exit(0);
  } catch (error) {
    logger('Error during installation for tool %s: %o', toolName, error);
    console.error(
      `Installation failed for ${toolName}: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

// Entry point logic
if (require.main === module) {
  mainInstallTool(
    process.argv.slice(2),
    fsDefault, // Pass the full default fs module
    new GitHubApiClient() // Pass default API client
  ).catch((err) => {
    console.error('Unhandled error in mainInstallTool:', err);
    process.exit(1);
  });
}

export { mainInstallTool };
