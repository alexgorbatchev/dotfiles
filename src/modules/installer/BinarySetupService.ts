import path from 'node:path';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, BinaryConfig, ToolConfig } from '@types';
import { createBinarySymlink } from '@utils';
import { normalizeBinaries } from './utils';

/**
 * Setup binaries from extracted archive - creates symlinks for all binaries using their patterns
 */
export async function setupBinariesFromArchive(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  context: BaseInstallContext,
  extractDir: string,
  logger: TsLogger
): Promise<void> {
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
  logger: TsLogger
): Promise<void> {
  for (const binaryConfig of binaryConfigs) {
    const { name: binaryName, pattern } = binaryConfig;

    // Find the binary using its pattern
    const binaryPath = await findBinaryUsingPattern(fs, extractDir, pattern, logger);

    if (!binaryPath) {
      logger.error(logs.installer.debug.binaryNotFound(), binaryName, pattern);
      continue;
    }

    // Create symlink for this binary
    const relativePath = path.relative(extractDir, binaryPath);
    await createBinarySymlink(fs, toolName, binaryName, timestamp, relativePath, binariesDir, logger);
  }
}

/**
 * Find a binary using a glob pattern within the extract directory
 */
/**
 * Find a binary using a glob pattern
 */
async function findBinaryUsingPattern(
  fs: IFileSystem,
  extractDir: string,
  pattern: string,
  logger: TsLogger
): Promise<string | null> {
  logger.debug(logs.installer.debug.searchingWithPattern(), pattern, extractDir);

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
    logger.debug(logs.installer.debug.searchingWithPattern(), `Trying fallback pattern: ${toolName}`, extractDir);

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
  logger: TsLogger
): Promise<string | null> {
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
      logger.debug(logs.installer.debug.patternPathNotFound(), currentDir);
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
  logger: TsLogger
): Promise<string | null> {
  const entries = await fs.readdir(currentDir);
  const regex = new RegExp(`^${wildcardPart.replace(/\*/g, '.*')}$`);
  const matches = entries.filter((entry) => regex.test(entry));

  if (matches.length === 0) {
    logger.debug(logs.installer.debug.noPatternMatch(), wildcardPart, currentDir);
    return null;
  }

  const firstMatch = matches[0];
  if (!firstMatch) {
    logger.debug(logs.installer.debug.noPatternMatch(), wildcardPart, currentDir);
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
  logger: TsLogger
): Promise<void> {
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);
  const primaryBinary = binaryConfigs[0]?.name || toolName;

  await fs.chmod(downloadPath, 0o755);

  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');
  const downloadFileName = path.basename(downloadPath);

  await createBinarySymlink(fs, toolName, primaryBinary, context.timestamp, downloadFileName, binariesDir, logger);

  if (binaryConfigs.length > 1) {
    logger.debug(logs.installer.debug.directDownloadSingleBinary(), binaryConfigs.length.toString(), primaryBinary);
  }
}
