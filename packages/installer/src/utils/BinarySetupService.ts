// TODO rename file because there's no service in this file
import path from 'node:path';
import type { BaseInstallContext, IBinaryConfig, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { minimatch } from 'minimatch';
import { createBinarySymlink } from './createBinarySymlinks';
import { messages } from './log-messages';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Sets up binaries from an extracted archive by finding them using patterns and creating symlinks.
 * Primary function for handling binaries after archive extraction (tar.gz, zip, etc.).
 *
 * Process:
 * 1. Normalizes binary configurations to include default patterns
 * 2. Uses minimatch patterns to locate binaries in extracted directory
 * 3. Creates symlinks in binaries directory pointing to found binaries
 * 4. Logs errors and shows directory tree if binaries not found
 *
 * The subdirectory name (version or timestamp) is extracted from context.installDir
 * and used for creating the symlink structure.
 *
 * @param fs - File system interface for file operations
 * @param toolName - Name of the tool being installed
 * @param toolConfig - Tool configuration with binary definitions
 * @param context - Install context with paths
 * @param extractDir - Directory where archive was extracted
 * @param parentLogger - Logger for diagnostic messages
 */
export async function setupBinariesFromArchive(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  context: BaseInstallContext,
  extractDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'setupBinariesFromArchive' });
  const binariesDir = path.join(context.projectConfig.paths.generatedDir, 'binaries');
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);

  // Extract subdirectory name from context.installDir
  // This will be either a version (e.g., "1.0.0") or timestamp (e.g., "2025-11-04-20-53-47")
  const subdirName = path.basename(context.installDir);

  await setupBinariesUsingPatterns(fs, toolName, binaryConfigs, subdirName, extractDir, binariesDir, logger);
}

/**
 * Setup binaries using pattern-based location (new approach)
 * @returns true if at least one binary was found and set up, false otherwise
 */
async function setupBinariesUsingPatterns(
  fs: IFileSystem,
  toolName: string,
  binaryConfigs: IBinaryConfig[],
  versionOrTimestamp: string,
  extractDir: string,
  binariesDir: string,
  parentLogger: TsLogger
): Promise<boolean> {
  const logger = parentLogger.getSubLogger({ name: 'setupBinariesUsingPatterns' });
  let foundAnyBinary = false;

  for (const binaryConfig of binaryConfigs) {
    const { name: binaryName, pattern } = binaryConfig;

    // Find the binary using its pattern
    const binaryPath = await findBinaryUsingPattern(fs, extractDir, pattern, binaryName, logger);

    if (!binaryPath) {
      logger.error(messages.binarySetupService.binaryNotFound(binaryName, pattern));

      // Show extracted files to help user find the correct binary
      const tree = await generateDirectoryTree(fs, extractDir);
      if (tree.length > 0) {
        const treeString = tree.join('\n');
        logger.error(messages.binarySetupService.extractedFilesTree(extractDir, treeString));
      }

      // Continue to next binary - don't fail the installation
      // The extracted files remain cached so user can fix the pattern and re-run
      continue;
    }

    // Create symlink for this binary
    const relativePath = path.relative(extractDir, binaryPath);
    await createBinarySymlink(fs, toolName, binaryName, versionOrTimestamp, relativePath, binariesDir, logger);
    foundAnyBinary = true;
  }

  return foundAnyBinary;
}

/**
 * Generate a tree-like listing of directory contents
 */
async function generateDirectoryTree(
  fs: IFileSystem,
  dirPath: string,
  prefix = '',
  maxDepth = 3,
  currentDepth = 0
): Promise<string[]> {
  const lines: string[] = [];

  if (currentDepth >= maxDepth) {
    return lines;
  }

  let entries: string[] = [];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return lines; // Skip directories that can't be read
  }

  const sortedEntries = entries.sort();

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    if (!entry) continue;

    const isLastEntry = i === sortedEntries.length - 1;
    const entryPath = path.join(dirPath, entry);
    const connector = isLastEntry ? '└── ' : '├── ';
    const childPrefix = prefix + (isLastEntry ? '    ' : '│   ');

    const entryLines = await formatDirectoryEntry(
      fs,
      entryPath,
      entry,
      prefix,
      connector,
      childPrefix,
      maxDepth,
      currentDepth
    );
    lines.push(...entryLines);
  }

  return lines;
}

/**
 * Format a single directory entry for tree output
 */
async function formatDirectoryEntry(
  fs: IFileSystem,
  entryPath: string,
  entry: string,
  prefix: string,
  connector: string,
  childPrefix: string,
  maxDepth: number,
  currentDepth: number
): Promise<string[]> {
  const lines: string[] = [];

  try {
    const stat = await fs.stat(entryPath);
    const displayName = stat.isDirectory() ? `${entry}/` : entry;
    lines.push(`${prefix}${connector}${displayName}`);

    if (stat.isDirectory() && currentDepth < maxDepth - 1) {
      const childLines = await generateDirectoryTree(fs, entryPath, childPrefix, maxDepth, currentDepth + 1);
      lines.push(...childLines);
    }
  } catch {
    // Skip entries that can't be accessed
    lines.push(`${prefix}${connector}${entry} (inaccessible)`);
  }

  return lines;
}

/**
 * Recursively collect all file paths in a directory
 */
async function getAllFiles(fs: IFileSystem, dirPath: string, basePath = dirPath): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const subFiles = await getAllFiles(fs, fullPath, basePath);
      files.push(...subFiles);
    } else {
      files.push(path.relative(basePath, fullPath));
    }
  }

  return files;
}

/**
 * Check if a file is executable
 */
async function isExecutable(fs: IFileSystem, filePath: string): Promise<boolean> {
  const stats = await fs.stat(filePath);
  const mode = stats.mode;
  return (mode & 0o111) !== 0;
}

/**
 * Find binary file using minimatch pattern, returns executable matching binaryName
 */
async function findBinaryUsingPattern(
  fs: IFileSystem,
  extractDir: string,
  pattern: string,
  binaryName: string,
  parentLogger: TsLogger
): Promise<string | null> {
  const logger = parentLogger.getSubLogger({ name: 'findBinaryUsingPattern' });
  logger.debug(messages.binarySetupService.searchingWithPattern(pattern, extractDir));

  const allFiles = await getAllFiles(fs, extractDir);
  const matchedFiles = allFiles.filter((file) => minimatch(file, pattern));

  if (matchedFiles.length === 0) {
    return null;
  }

  const executables: string[] = [];
  for (const file of matchedFiles) {
    const fullPath = path.join(extractDir, file);
    if (await isExecutable(fs, fullPath)) {
      executables.push(file);
    }
  }

  if (executables.length === 0) {
    return null;
  }

  const matchingBinary = executables.find((file) => path.basename(file) === binaryName);

  if (!matchingBinary) {
    return null;
  }

  return path.join(extractDir, matchingBinary);
}

/**
 * Setup binaries from direct download - handles all binaries in toolConfig.binaries[]
 */
export async function setupBinariesFromDirectDownload(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  context: BaseInstallContext,
  downloadPath: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'setupBinariesFromDirectDownload' });
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);
  const primaryBinary = binaryConfigs[0]?.name || toolName;

  await fs.chmod(downloadPath, 0o755);

  const binariesDir = path.join(context.projectConfig.paths.generatedDir, 'binaries');
  const downloadFileName = path.basename(downloadPath);

  // Extract subdirectory name from context.installDir
  // This will be either a version (e.g., "1.0.0") or timestamp (e.g., "2025-11-04-20-53-47")
  const subdirName = path.basename(context.installDir);

  await createBinarySymlink(fs, toolName, primaryBinary, subdirName, downloadFileName, binariesDir, logger);

  if (binaryConfigs.length > 1) {
    logger.debug(messages.binarySetupService.directDownloadSingleBinary(binaryConfigs.length, primaryBinary));
  }
}
