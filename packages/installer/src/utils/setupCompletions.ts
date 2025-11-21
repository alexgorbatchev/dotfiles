import path from 'node:path';
import type { InstallContext, ShellCompletionConfig, ShellType, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';

/**
 * Sets up shell completions for a tool.
 *
 * Iterates through the tool's shell configurations and sets up completions for each shell
 * that has a completion source defined. It handles resolving the source file path (checking
 * both the extraction directory and relative to the config file) and creating a symlink
 * in the appropriate shell completion directory.
 */
export async function setupCompletions(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  context: InstallContext,
  extractDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'setupCompletions' });

  if (!toolConfig.shellConfigs) {
    return;
  }

  for (const [shellType, shellConfig] of Object.entries(toolConfig.shellConfigs)) {
    const completions = shellConfig?.completions;
    if (!completions?.source) {
      continue;
    }

    await setupShellCompletion(
      fs,
      toolName,
      toolConfig,
      shellType as ShellType,
      completions,
      extractDir,
      context,
      logger
    );
  }
}

async function setupShellCompletion(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  shellType: ShellType,
  completions: ShellCompletionConfig,
  extractDir: string,
  context: InstallContext,
  logger: TsLogger
): Promise<void> {
  if (!completions.source) {
    return;
  }

  const sourcePath = await resolveSourcePath(fs, toolConfig, extractDir, completions.source);

  const targetDir =
    completions.targetDir ?? path.join(context.projectConfig.paths.shellScriptsDir, shellType, 'completions');
  const targetFile = path.join(targetDir, completions.name ?? `_${toolName}`);

  logger.debug(messages.completion.symlinking(shellType, sourcePath, targetFile));

  if (await fs.exists(sourcePath)) {
    await fs.ensureDir(targetDir);
    if (await fs.exists(targetFile)) {
      await fs.rm(targetFile);
    }
    await fs.symlink(sourcePath, targetFile);
  } else {
    logger.warn(messages.completion.notFound(sourcePath));
  }
}

async function resolveSourcePath(
  fs: IFileSystem,
  toolConfig: ToolConfig,
  extractDir: string,
  source: string
): Promise<string> {
  let sourcePath = path.join(extractDir, source);

  // If not found in extractDir, try relative to config file
  if (!(await fs.exists(sourcePath)) && toolConfig.configFilePath) {
    const configDir = path.dirname(toolConfig.configFilePath);
    const localPath = path.resolve(configDir, source);
    if (await fs.exists(localPath)) {
      sourcePath = localPath;
    }
  }

  return sourcePath;
}
