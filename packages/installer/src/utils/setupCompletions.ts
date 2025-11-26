import path from 'node:path';
import type { InstallContext, ShellCompletionConfig, ShellType, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import { minimatch } from 'minimatch';
import { messages } from './log-messages';

/**
 * Sets up shell completions for a tool by symlinking completion files from the extracted archive.
 *
 * This function is called during installation after the tool archive has been extracted.
 * It iterates through the tool's shell configurations and processes completions with `source` paths.
 *
 * **Path Resolution:**
 * - `source` paths are relative to the extracted archive root directory
 * - Primary: Checks `extractDir/source` (e.g., `extractDir/completions/_tool.zsh`)
 * - Fallback: Checks relative to tool config file if not found in archive
 * - Creates symlinks from resolved source to the target completion directory
 *
 * **Note:** This only handles `source`-based completions. Command-based completions (`cmd`)
 * are handled separately by the completion generator during shell init generation.
 *
 * @param fs - File system interface for file operations
 * @param toolName - Name of the tool being installed
 * @param toolConfig - Complete tool configuration including shell configs
 * @param context - Installation context with paths and configuration
 * @param extractDir - Directory where the tool archive was extracted
 * @param parentLogger - Logger for creating sub-loggers
 *
 * @example
 * // Tool config specifies: source: 'completions/_ripgrep.zsh'
 * // Archive extracted to: /path/to/.generated/binaries/rg/2025-11-21-12-00-00/
 * // System looks for: /path/to/.generated/binaries/rg/2025-11-21-12-00-00/completions/_ripgrep.zsh
 * // Symlinks to: /path/to/.generated/shell/zsh/completions/_rg
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
    const completionFs = fs instanceof TrackedFileSystem ? fs.withFileType('completion') : fs;

    await completionFs.ensureDir(targetDir);
    if (await completionFs.exists(targetFile)) {
      await completionFs.rm(targetFile);
    }
    await completionFs.symlink(sourcePath, targetFile);
  } else {
    logger.warn(messages.completion.notFound(sourcePath));
  }
}

/**
 * Resolves the source path for a completion file.
 *
 * Attempts to find the completion file in two locations:
 * 1. **Primary:** Relative to the extracted archive directory (`extractDir/source`)
 * 2. **Fallback:** Relative to the tool's config file directory
 *
 * The fallback allows for completions to be provided alongside config files
 * when tools don't include completions in their release archives.
 *
 * @param fs - File system interface
 * @param toolConfig - Tool configuration with optional config file path
 * @param extractDir - Directory where the tool archive was extracted
 * @param source - Relative path to completion file (from tool config)
 * @returns Resolved absolute path to the completion source file
 */
async function resolveSourcePath(
  fs: IFileSystem,
  toolConfig: ToolConfig,
  extractDir: string,
  source: string
): Promise<string> {
  // If source contains glob patterns, resolve using minimatch
  if (source.includes('*') || source.includes('?') || source.includes('[')) {
    const allFiles = await getAllFiles(fs, extractDir);
    const matched = allFiles.find((file) => minimatch(file, source));
    if (matched) {
      return path.join(extractDir, matched);
    }
  }

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

async function getAllFiles(fs: IFileSystem, directory: string, baseDir?: string): Promise<string[]> {
  const base = baseDir ?? directory;
  const results: string[] = [];
  const entries = await fs.readdir(directory);

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const subFiles = await getAllFiles(fs, fullPath, base);
      results.push(...subFiles);
    } else {
      const relativePath = path.relative(base, fullPath);
      results.push(relativePath);
    }
  }

  return results;
}
