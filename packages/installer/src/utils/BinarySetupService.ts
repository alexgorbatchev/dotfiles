import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, BinaryConfig, ToolConfig } from '@dotfiles/schemas';
import { installerLogMessages } from './log-messages';
import { createBinarySymlink } from './createBinarySymlinks';
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
  logger: TsLogger
): Promise<void> {
  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);

  const methodLogger = logger.getSubLogger({ name: 'setupBinariesFromArchive' });

  await setupBinariesUsingPatterns(
    fs,
    toolName,
    binaryConfigs,
    context.timestamp,
    extractDir,
    binariesDir,
    methodLogger
  );
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
  const methodLogger = logger.getSubLogger({ name: 'setupBinariesUsingPatterns' });
  for (const binaryConfig of binaryConfigs) {
    const { name: binaryName, pattern } = binaryConfig;

    // Find the binary using its pattern
    const binaryPath = await findBinaryUsingPattern(fs, extractDir, pattern, methodLogger);

    if (!binaryPath) {
      methodLogger.error(installerLogMessages.binarySetupService.binaryNotFound(binaryName, pattern));
      continue;
    }

    // Create symlink for this binary
    const relativePath = path.relative(extractDir, binaryPath);
    await createBinarySymlink(fs, toolName, binaryName, timestamp, relativePath, binariesDir, methodLogger);
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
  const methodLogger = logger.getSubLogger({ name: 'findBinaryUsingPattern' });
  methodLogger.debug(installerLogMessages.binarySetupService.searchingWithPattern(pattern, extractDir));

  // Try the primary pattern first
  let result: string | null = null;

  if (pattern.includes('*')) {
    result = await findBinaryWithWildcards(fs, extractDir, pattern, methodLogger);
  } else {
    result = await findBinaryWithDirectPath(fs, extractDir, pattern);
  }

  // If primary pattern failed and it's a wildcard pattern like '*/tool', try fallback patterns
  if (!result && pattern.startsWith('*/')) {
    const toolName = pattern.substring(2); // Remove '*/' prefix
    methodLogger.debug(installerLogMessages.binarySetupService.fallbackPattern(toolName, extractDir));

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
  const methodLogger = logger.getSubLogger({ name: 'findBinaryWithWildcards' });
  const parts = pattern.split('/');
  let currentDir = extractDir;

  for (const part of parts) {
    if (!part) continue;

    if (part.includes('*')) {
      const matchedDir = await findWildcardMatch(fs, currentDir, part, methodLogger);
      if (!matchedDir) {
        return null;
      }
      currentDir = matchedDir;
    } else {
      currentDir = path.join(currentDir, part);
    }

    if (!(await fs.exists(currentDir))) {
      methodLogger.debug(installerLogMessages.binarySetupService.patternPathMissing(currentDir));
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
  const methodLogger = logger.getSubLogger({ name: 'findWildcardMatch' });
  const entries = await fs.readdir(currentDir);
  const regex = new RegExp(`^${wildcardPart.replace(/\*/g, '.*')}$`);
  const matches = entries.filter((entry) => regex.test(entry));

  if (matches.length === 0) {
    methodLogger.debug(installerLogMessages.binarySetupService.noPatternMatch(wildcardPart, currentDir));
    return null;
  }

  const firstMatch = matches[0];
  if (!firstMatch) {
    methodLogger.debug(installerLogMessages.binarySetupService.noPatternMatch(wildcardPart, currentDir));
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
  const methodLogger = logger.getSubLogger({ name: 'setupBinariesFromDirectDownload' });
  const binaryConfigs = normalizeBinaries(toolConfig.binaries, toolName);
  const primaryBinary = binaryConfigs[0]?.name || toolName;

  await fs.chmod(downloadPath, 0o755);

  const binariesDir = path.join(context.appConfig.paths.generatedDir, 'binaries');
  const downloadFileName = path.basename(downloadPath);

  await createBinarySymlink(
    fs,
    toolName,
    primaryBinary,
    context.timestamp,
    downloadFileName,
    binariesDir,
    methodLogger
  );

  if (binaryConfigs.length > 1) {
    methodLogger.debug(
      installerLogMessages.binarySetupService.directDownloadSingleBinary(binaryConfigs.length, primaryBinary)
    );
  }
}
