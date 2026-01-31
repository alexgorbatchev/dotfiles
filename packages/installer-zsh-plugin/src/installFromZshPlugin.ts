import type { IInstallContext, Shell } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import { withInstallErrorHandling } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import path from 'node:path';
import { messages } from './log-messages';
import type { ZshPluginToolConfig } from './schemas';
import type { IZshPluginInstallMetadata, ZshPluginInstallResult } from './types';

/**
 * Installs a zsh plugin by cloning a git repository.
 *
 * This function handles the complete installation process for zsh plugins:
 * 1. Resolves the git URL from repo shorthand or full URL
 * 2. Determines the plugin name (from params or derived from URL)
 * 3. Clones or updates the repository in the plugins directory
 * 4. Retrieves version information from git
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the zsh plugin.
 * @param context - The base installation context.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @param fs - The file system interface.
 * @param shell - The shell executor for running git commands.
 * @returns A promise that resolves to the installation result.
 */
export async function installFromZshPlugin(
  toolName: string,
  toolConfig: ZshPluginToolConfig,
  context: IInstallContext,
  parentLogger: TsLogger,
  fs: IResolvedFileSystem,
  shell: Shell,
): Promise<ZshPluginInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromZshPlugin' });
  logger.debug(messages.installing(toolName));

  const params = toolConfig.installParams;

  if (!params) {
    return {
      success: false,
      error: 'No install parameters provided',
    };
  }

  if (!params.repo && !params.url) {
    return {
      success: false,
      error: 'Either repo or url must be specified',
    };
  }

  const operation = async (): Promise<ZshPluginInstallResult> => {
    // Resolve git URL
    const gitUrl = params.url ?? `https://github.com/${params.repo}.git`;

    // Derive plugin name
    const pluginName = resolvePluginName(params.pluginName, params.repo, params.url);

    // Plugin destination path
    const pluginPath = path.join(context.stagingDir, pluginName);

    // Check if plugin already exists (update vs fresh clone)
    const exists = await fs.exists(pluginPath);

    if (exists) {
      logger.debug(messages.updating(pluginPath));
      await updatePlugin(pluginPath, shell);
      logger.info(messages.updateSuccess(pluginName));
    } else {
      logger.debug(messages.cloning(gitUrl, pluginPath));
      await clonePlugin(gitUrl, pluginPath, shell);
      logger.info(messages.cloneSuccess(pluginName));
    }

    // Detect or use specified source file
    const sourceFile = await detectSourceFile(pluginPath, pluginName, params.source, fs, logger);
    if (!sourceFile) {
      return {
        success: false,
        error: `Could not detect plugin source file in ${pluginPath}. Specify 'source' parameter explicitly.`,
      };
    }

    // Create symlink to $ZSH_CUSTOM/plugins or custom target
    const zshCustom = process.env['ZSH_CUSTOM'];
    const targetDir = params.target ?? (zshCustom ? path.join(zshCustom, 'plugins') : null);

    if (!targetDir) {
      return {
        success: false,
        error: `$ZSH_CUSTOM environment variable is not set. Either set it or provide 'target' parameter explicitly.`,
      };
    }

    const symlinkTarget = path.join(targetDir, pluginName);
    const symlinkSource = path.join(context.currentDir, pluginName);

    await createPluginSymlink(symlinkSource, symlinkTarget, fs, logger);

    // Get version from git
    const version = await getGitVersion(pluginPath, shell, logger);

    const metadata: IZshPluginInstallMetadata = {
      method: 'zsh-plugin',
      pluginName,
      gitUrl,
      pluginPath,
      sourceFile,
      symlinkPath: symlinkTarget,
    };

    return {
      success: true,
      binaryPaths: [],
      version,
      metadata,
    };
  };

  return withInstallErrorHandling('zsh-plugin', toolName, logger, operation);
}

/**
 * Resolves the plugin name from parameters.
 */
function resolvePluginName(
  pluginName: string | undefined,
  repo: string | undefined,
  url: string | undefined,
): string {
  if (pluginName) {
    return pluginName;
  }

  if (repo) {
    // Extract repo name from user/repo
    return repo.split('/')[1] ?? repo;
  }

  if (url) {
    // Extract from URL: https://github.com/user/repo.git -> repo
    const urlPath = new URL(url).pathname;
    const basename = path.basename(urlPath, '.git');
    return basename;
  }

  throw new Error('Cannot determine plugin name');
}

/**
 * Detects or validates the plugin source file.
 * Checks common zsh plugin file patterns in order of preference.
 */
async function detectSourceFile(
  pluginPath: string,
  pluginName: string,
  explicitSource: string | undefined,
  fs: IResolvedFileSystem,
  parentLogger: TsLogger,
): Promise<string | undefined> {
  const logger = parentLogger.getSubLogger({ name: 'detectSourceFile' });

  // If explicitly specified, validate it exists
  if (explicitSource) {
    const fullPath = path.join(pluginPath, explicitSource);
    if (await fs.exists(fullPath)) {
      logger.debug(messages.sourceFileDetected(explicitSource));
      return explicitSource;
    }
    logger.warn(messages.sourceFileNotFound(explicitSource));
    return undefined;
  }

  // Common zsh plugin file patterns in order of preference
  const candidates = [
    `${pluginName}.plugin.zsh`,
    `${pluginName}.zsh`,
    'init.zsh',
    'plugin.zsh',
    `${pluginName}.zsh-theme`,
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(pluginPath, candidate);
    if (await fs.exists(fullPath)) {
      logger.debug(messages.sourceFileDetected(candidate));
      return candidate;
    }
  }

  return undefined;
}

/**
 * Clones a git repository.
 */
async function clonePlugin(gitUrl: string, destPath: string, shell: Shell): Promise<void> {
  await shell`git clone --depth 1 ${gitUrl} ${destPath}`.quiet();
}

/**
 * Updates an existing git repository.
 */
async function updatePlugin(pluginPath: string, shell: Shell): Promise<void> {
  await shell`git -C ${pluginPath} pull --ff-only`.quiet();
}

/**
 * Gets the git commit hash or tag as version.
 */
async function getGitVersion(pluginPath: string, shell: Shell, parentLogger: TsLogger): Promise<string | undefined> {
  const logger = parentLogger.getSubLogger({ name: 'getGitVersion' });

  try {
    // Try to get the latest tag first
    const tagResult = await shell`git -C ${pluginPath} describe --tags --abbrev=0`.quiet().noThrow();
    if (tagResult.code === 0) {
      const version = tagResult.stdout.trim();
      logger.debug(messages.versionDetected(version));
      return version;
    }

    // Fall back to short commit hash
    const hashResult = await shell`git -C ${pluginPath} rev-parse --short HEAD`.quiet().noThrow();
    if (hashResult.code === 0) {
      const version = hashResult.stdout.trim();
      logger.debug(messages.versionDetected(version));
      return version;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creates a symlink for the plugin in the target directory.
 */
async function createPluginSymlink(
  source: string,
  target: string,
  fs: IResolvedFileSystem,
  parentLogger: TsLogger,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'createPluginSymlink' });

  // Ensure target directory exists
  const targetDir = path.dirname(target);
  await fs.ensureDir(targetDir);

  // Remove existing symlink if present
  if (await fs.exists(target)) {
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink()) {
      await fs.rm(target);
    } else {
      logger.warn(messages.symlinkTargetExists(target));
      return;
    }
  }

  // Create symlink
  await fs.symlink(source, target);
  logger.info(messages.symlinkCreated(target, source));
}
