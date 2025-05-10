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
import { installGithubRelease } from './installers/github-release'; // Import the new installer
import { installBrew } from './installers/brew'; // Import installBrew
import { installPip } from './installers/pip'; // Import installPip
import { installManual } from './installers/manual'; // Import installManual

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
      case 'github-release':
        await installGithubRelease(
          toolName,
          toolConfig,
          binaryName,
          finalBinaryPath,
          currentOs,
          currentArch,
          fs,
          apiClientInstance
        );
        break;
      case 'brew':
        await installBrew(
          toolName,
          toolConfig,
          binaryName,
          finalBinaryPath,
          currentOs,
          currentArch,
          fs
        );
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
        await installPip(
          toolName,
          toolConfig,
          binaryName,
          finalBinaryPath,
          currentOs,
          currentArch,
          fs
        );
        break;
      case 'manual': {
        await installManual(
          toolName,
          toolConfig,
          binaryName,
          finalBinaryPath,
          currentOs,
          currentArch,
          fs
        );
        break;
      }
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
