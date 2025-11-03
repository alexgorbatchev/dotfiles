import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, BinaryConfig, ToolConfig } from '@dotfiles/schemas';
import { createBinarySymlink } from './createBinarySymlinks';
import { messages } from './log-messages';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Setup binaries from extracted archive - creates symlinks for all binaries using their patterns
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
  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);

  await setupBinariesUsingPatterns(fs, toolName, binaryConfigs, context.timestamp, extractDir, binariesDir, logger);
}

/**
 * Setup binaries using pattern-based location (new approach)
 */
async function setupBinariesUsingPatterns(
  fs: IFileSystem,
  toolName: string,
  binaryConfigs: BinaryConfig[],
  timestamp: string,
  extractDir: string,
  binariesDir: string,
  parentLogger: TsLogger
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'setupBinariesUsingPatterns' });
  for (const binaryConfig of binaryConfigs) {
    const { name: binaryName, pattern } = binaryConfig;

    // Find the binary using its pattern
    const binaryPath = await findBinaryUsingPattern(fs, extractDir, pattern, logger);

    if (!binaryPath) {
      logger.error(messages.binarySetupService.binaryNotFound(binaryName, pattern));

      // Show extracted files to help user find the correct binary
      const tree = await generateDirectoryTree(fs, extractDir);
      if (tree.length > 0) {
        const treeString = tree.join('\n');
        logger.error(messages.binarySetupService.extractedFilesTree(extractDir, treeString));
      }

      continue;
    }

    // Create symlink for this binary
    const relativePath = path.relative(extractDir, binaryPath);
    await createBinarySymlink(fs, toolName, binaryName, timestamp, relativePath, binariesDir, logger);
  }
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
 * Find a binary using a glob pattern within the extract directory
 */
async function findBinaryUsingPattern(
  fs: IFileSystem,
  extractDir: string,
  pattern: string,
  parentLogger: TsLogger
): Promise<string | null> {
  const logger = parentLogger.getSubLogger({ name: 'findBinaryUsingPattern' });
  logger.debug(messages.binarySetupService.searchingWithPattern(pattern, extractDir));

  // Try the primary pattern first
  let result: string | null = null;

  if (pattern.includes('*')) {
    result = await findBinaryWithWildcards(fs, extractDir, pattern, logger);
  } else {
    result = await findBinaryWithDirectPath(fs, extractDir, pattern);
  }

  // If primary pattern failed and it's a wildcard pattern like '*/tool', try fallback patterns
  if (!result && pattern.startsWith('*/')) {
    const toolName = pattern.substring(2); // Remove '*/' prefix
    logger.debug(messages.binarySetupService.fallbackPattern(toolName, extractDir));

    // Try direct path as fallback
    result = await findBinaryWithDirectPath(fs, extractDir, toolName);
  }

  return result;
}

/**
 * Handle patterns with wildcards like 'ripgrep-star/rg' or 'star/bin/kubectl'
 */
async function findBinaryWithWildcards(
  fs: IFileSystem,
  extractDir: string,
  pattern: string,
  parentLogger: TsLogger
): Promise<string | null> {
  const logger = parentLogger.getSubLogger({ name: 'findBinaryWithWildcards' });
  const parts = pattern.split('/');
  let currentDir = extractDir;

  for (const part of parts) {
    if (!part) continue;

    if (part.includes('*')) {
      const matchedDir = await findWildcardMatch(fs, currentDir, part, logger);
      if (!matchedDir) {
        return null;
      }
      currentDir = matchedDir;
    } else {
      currentDir = path.join(currentDir, part);
    }

    if (!(await fs.exists(currentDir))) {
      logger.debug(messages.binarySetupService.patternPathMissing(currentDir));
      return null;
    }
  }

  return currentDir;
}

/**
 * Find the first directory/file matching a wildcard pattern
 */
async function findWildcardMatch(
  fs: IFileSystem,
  currentDir: string,
  wildcardPart: string,
  parentLogger: TsLogger
): Promise<string | null> {
  const logger = parentLogger.getSubLogger({ name: 'findWildcardMatch' });
  const entries = await fs.readdir(currentDir);
  const regex = new RegExp(`^${wildcardPart.replace(/\*/g, '.*')}$`);
  const matches = entries.filter((entry) => regex.test(entry));

  if (matches.length === 0) {
    logger.debug(messages.binarySetupService.noPatternMatch(wildcardPart, currentDir));
    return null;
  }

  const firstMatch = matches[0];
  if (!firstMatch) {
    logger.debug(messages.binarySetupService.noPatternMatch(wildcardPart, currentDir));
    return null;
  }

  return path.join(currentDir, firstMatch);
}

/**
 * Handle direct path patterns without wildcards
 */
async function findBinaryWithDirectPath(fs: IFileSystem, extractDir: string, pattern: string): Promise<string | null> {
  const directPath = path.join(extractDir, pattern);
  if (await fs.exists(directPath)) {
    return directPath;
  }
  return null;
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

  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');
  const downloadFileName = path.basename(downloadPath);

  await createBinarySymlink(fs, toolName, primaryBinary, context.timestamp, downloadFileName, binariesDir, logger);

  if (binaryConfigs.length > 1) {
    logger.debug(messages.binarySetupService.directDownloadSingleBinary(binaryConfigs.length, primaryBinary));
  }
}
