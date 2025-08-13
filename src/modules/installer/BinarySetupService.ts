import path from 'node:path';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { BaseInstallContext, ExtractResult, InstallParams, ToolConfig } from '@types';

/**
 * Setup binaries from extracted archive - handles all binaries in toolConfig.binaries[]
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
  const binaryNames = toolConfig.binaries || [toolName];
  const installParams: InstallParams | undefined = toolConfig.installParams;

  const primarySourcePath = determinePrimaryBinaryPath(extractDir, toolName, installParams, extractResult, logger);

  await validateAndCopyPrimaryBinary(fs, primarySourcePath, binaryNames, context, extractResult, logger);
  await copyAdditionalBinaries(fs, binaryNames, extractDir, context, logger);
}

function determinePrimaryBinaryPath(
  extractDir: string,
  toolName: string,
  installParams: InstallParams | undefined,
  extractResult: ExtractResult | undefined,
  logger: TsLogger
): string {
  if (installParams && 'binaryPath' in installParams && installParams.binaryPath) {
    return path.join(extractDir, installParams.binaryPath);
  }

  if (installParams && 'extractPath' in installParams && installParams.extractPath) {
    return path.join(extractDir, installParams.extractPath);
  }

  if (extractResult?.executables && extractResult.executables.length > 0) {
    return findExecutablePath(extractDir, toolName, extractResult.executables, logger);
  }

  if (extractResult?.extractedFiles && extractResult.extractedFiles.length === 1) {
    return handleSingleExtractedFile(extractDir, toolName, extractResult.extractedFiles, logger);
  }

  if (extractResult?.extractedFiles) {
    return findFallbackBinary(extractDir, toolName, extractResult.extractedFiles, logger);
  }

  return path.join(extractDir, toolName);
}

function findExecutablePath(extractDir: string, toolName: string, executables: string[], logger: TsLogger): string {
  const exeMatchingToolName = executables.find((exe) => path.basename(exe) === toolName);
  if (exeMatchingToolName) {
    const primarySourcePath = path.join(extractDir, exeMatchingToolName);
    logger.debug(logs.installer.debug.foundExecutable(), primarySourcePath);
    return primarySourcePath;
  }

  const firstExecutable = executables[0];
  if (firstExecutable) {
    const primarySourcePath = path.join(extractDir, firstExecutable);
    logger.debug(logs.installer.debug.foundExecutable(), primarySourcePath);
    return primarySourcePath;
  }

  return path.join(extractDir, toolName);
}

function handleSingleExtractedFile(
  extractDir: string,
  toolName: string,
  extractedFiles: string[],
  logger: TsLogger
): string {
  const singleFile = extractedFiles[0];
  if (singleFile) {
    const primarySourcePath = path.join(extractDir, singleFile);
    logger.debug(logs.installer.debug.assumingSingleBinary(), primarySourcePath);
    return primarySourcePath;
  }
  return path.join(extractDir, toolName);
}

function findFallbackBinary(extractDir: string, toolName: string, extractedFiles: string[], logger: TsLogger): string {
  const potentialBinary = extractedFiles.find((f) => f.includes(toolName));
  if (potentialBinary) {
    const primarySourcePath = path.join(extractDir, potentialBinary);
    logger.debug(logs.installer.debug.attemptingFallback(), primarySourcePath);
    return primarySourcePath;
  }

  logger.debug(logs.installer.debug.noExecutableFound(), extractedFiles);
  return path.join(extractDir, toolName);
}

async function validateAndCopyPrimaryBinary(
  fs: IFileSystem,
  primarySourcePath: string,
  binaryNames: string[],
  context: BaseInstallContext,
  extractResult: ExtractResult | undefined,
  logger: TsLogger
): Promise<void> {
  if (!(await fs.exists(primarySourcePath))) {
    const errorMsg = `Binary not found at expected path after extraction: ${primarySourcePath}${
      extractResult?.extractedFiles ? `. Extracted files: ${extractResult.extractedFiles.join(', ')}` : ''
    }`;
    throw new Error(errorMsg);
  }

  const primaryBinary = binaryNames[0] || context.toolName;
  const finalPrimaryPath = path.join(context.installDir, primaryBinary);

  logger.debug(logs.installer.debug.movingBinary(), primarySourcePath, finalPrimaryPath);
  await fs.copyFile(primarySourcePath, finalPrimaryPath);
}

async function copyAdditionalBinaries(
  fs: IFileSystem,
  binaryNames: string[],
  extractDir: string,
  context: BaseInstallContext,
  logger: TsLogger
): Promise<void> {
  for (let i = 1; i < binaryNames.length; i++) {
    const binaryName = binaryNames[i];
    if (binaryName) {
      const additionalSourcePath = path.join(extractDir, binaryName);
      const additionalFinalPath = path.join(context.installDir, binaryName);

      if (await fs.exists(additionalSourcePath)) {
        logger.debug(logs.installer.debug.movingBinary(), additionalSourcePath, additionalFinalPath);
        await fs.copyFile(additionalSourcePath, additionalFinalPath);
      } else {
        logger.debug(logs.installer.debug.binaryNotFound(), binaryName, additionalSourcePath);
      }
    }
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
  const finalBinaryPath = path.join(context.installDir, primaryBinary);

  logger.debug(logs.installer.debug.movingBinary(), downloadPath, finalBinaryPath);
  await fs.copyFile(downloadPath, finalBinaryPath);

  // Make binary executable for direct downloads (may not preserve permissions)
  await fs.chmod(finalBinaryPath, 0o755);

  // Clean up original downloaded file if it was renamed
  if (downloadPath !== finalBinaryPath && (await fs.exists(downloadPath))) {
    logger.debug(logs.installer.debug.cleaningArchive(), downloadPath);
    await fs.rm(downloadPath);
  }

  // For direct downloads with multiple binary names, we can't provide them all
  // Log a warning if multiple binaries were requested
  if (binaryNames.length > 1) {
    logger.debug(logs.installer.debug.directDownloadSingleBinary(), binaryNames.length.toString(), primaryBinary);
  }
}
