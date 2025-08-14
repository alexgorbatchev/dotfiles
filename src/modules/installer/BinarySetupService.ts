import path from 'node:path';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, BinaryConfig, ExtractResult, ToolConfig } from '@types';
import { createAllBinarySymlinks, createBinarySymlink } from '@utils';

/**
 * Setup binaries from extracted archive - creates symlinks for all binaries using their patterns
 */
export async function setupBinariesFromArchive(
  fs: IFileSystem,
  toolName: string,
  toolConfig: ToolConfig,
  context: BaseInstallContext,
  extractDir: string,
  logger: TsLogger,
  extractResult?: ExtractResult
): Promise<void> {
  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');

  // Use new pattern-based approach if available
  if (toolConfig.binaryConfigs && toolConfig.binaryConfigs.length > 0) {
    await setupBinariesUsingPatterns(
      fs,
      toolName,
      toolConfig.binaryConfigs,
      context.timestamp,
      extractDir,
      binariesDir,
      logger
    );
    return;
  }

  // Fallback to legacy approach for backward compatibility
  const binaryNames = toolConfig.binaries || [toolName];

  // Find where binaries are located within the extracted archive
  const binaryBasePath = await determineBinaryBasePath(fs, extractDir, logger);

  // Validate that all binaries exist
  await validateBinariesExist(fs, extractDir, binaryBasePath, binaryNames, extractResult, logger);

  // Create symlinks for all binaries
  await createAllBinarySymlinks(fs, toolName, binaryNames, context.timestamp, binaryBasePath, binariesDir, logger);
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
 * Determine the base path where binaries are located within the extracted archive
 * This checks for a bin directory and returns the directory containing binaries
 * Returns a path relative to the timestamped directory
 */
async function determineBinaryBasePath(fs: IFileSystem, extractDir: string, logger: TsLogger): Promise<string> {
  let searchDir = extractDir;

  // Check if there's a bin directory that might contain the binaries
  const binDir = path.join(searchDir, 'bin');
  if (await fs.exists(binDir)) {
    const binDirStat = await fs.stat(binDir);
    if (binDirStat.isDirectory()) {
      logger.debug(logs.installer.debug.foundBinDirectory(), binDir);
      searchDir = binDir;
    }
  }

  // Return the search directory relative to extractDir
  return path.relative(extractDir, searchDir);
}

/**
 * Validate that all required binaries exist in the determined location
 */
async function validateBinariesExist(
  fs: IFileSystem,
  extractDir: string,
  binaryBasePath: string,
  binaryNames: string[],
  extractResult: ExtractResult | undefined,
  logger: TsLogger
): Promise<void> {
  const absoluteBasePath = path.join(extractDir, binaryBasePath);

  for (const binaryName of binaryNames) {
    const binaryPath = path.join(absoluteBasePath, binaryName);
    if (!(await fs.exists(binaryPath))) {
      const errorMsg = `Binary "${binaryName}" not found at expected path: ${binaryPath}${
        extractResult?.extractedFiles ? `. Extracted files: ${extractResult.extractedFiles.join(', ')}` : ''
      }`;
      throw new Error(errorMsg);
    }
    logger.debug(logs.installer.debug.foundExecutable(), binaryPath);
  }
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
  const binaryNames = toolConfig.binaries || [toolName];

  // For direct downloads, we only have one file, so use it for the first binary
  const primaryBinary = binaryNames[0] || toolName;

  // Make the downloaded file executable
  await fs.chmod(downloadPath, 0o755);

  // Create symlink to the downloaded file
  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');
  const downloadFileName = path.basename(downloadPath);

  await createBinarySymlink(fs, toolName, primaryBinary, context.timestamp, downloadFileName, binariesDir, logger);

  // For direct downloads with multiple binary names, we can't provide them all
  // Log a warning if multiple binaries were requested
  if (binaryNames.length > 1) {
    logger.debug(logs.installer.debug.directDownloadSingleBinary(), binaryNames.length.toString(), primaryBinary);
  }
}
