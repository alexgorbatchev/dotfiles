import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { ToolConfig, ExtractResult, BaseInstallContext } from '@types';

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
    extractResult?: ExtractResult,
  ): Promise<void> {
    const binaryNames = toolConfig.binaries || [toolName];
    const installParams = toolConfig.installParams as any;
    
    // Determine the primary binary source path using the same logic as original
    let primarySourcePath: string;
    
    if (installParams?.binaryPath) {
      // Use explicit binaryPath from toolConfig.installParams (GitHub releases)
      primarySourcePath = path.join(extractDir, installParams.binaryPath);
    } else if (installParams?.extractPath) {
      // Use extractPath from toolConfig.installParams (curl-tar)
      primarySourcePath = path.join(extractDir, installParams.extractPath);
    } else if (extractResult?.executables && extractResult.executables.length > 0) {
      // Prefer the first executable found if multiple, or one that matches toolName
      const exeMatchingToolName = extractResult.executables.find(
        (exe) => path.basename(exe) === toolName
      );
      if (exeMatchingToolName) {
        primarySourcePath = path.join(extractDir, exeMatchingToolName);
      } else if (extractResult.executables.length) {
        primarySourcePath = path.join(extractDir, extractResult.executables[0] as string);
      } else {
        primarySourcePath = path.join(extractDir, toolName);
      }
      logger.debug(logs.installer.debug.foundExecutable(), primarySourcePath);
    } else if (extractResult?.extractedFiles && extractResult.extractedFiles.length === 1) {
      // If only one file was extracted, assume it's the binary
      primarySourcePath = path.join(extractDir, extractResult.extractedFiles[0] as string);
      logger.debug(logs.installer.debug.assumingSingleBinary(), primarySourcePath);
    } else if (extractResult?.extractedFiles) {
      // Fallback: attempt to find a file named like the tool
      const potentialBinary = extractResult.extractedFiles.find((f) => f.includes(toolName));
      if (potentialBinary) {
        primarySourcePath = path.join(extractDir, potentialBinary);
        logger.debug(logs.installer.debug.attemptingFallback(), primarySourcePath);
      } else {
        logger.debug(logs.installer.debug.noExecutableFound(), extractResult.extractedFiles);
        primarySourcePath = path.join(extractDir, toolName); // Default fallback
      }
    } else {
      // No extractResult provided, fallback to toolName
      primarySourcePath = path.join(extractDir, toolName);
    }

    // Verify the primary binary exists and copy it
    if (!(await fs.exists(primarySourcePath))) {
      const errorMsg = `Binary not found at expected path after extraction: ${primarySourcePath}${
        extractResult?.extractedFiles ? `. Extracted files: ${extractResult.extractedFiles.join(', ')}` : ''
      }`;
      throw new Error(errorMsg);
    }

    // Handle the primary binary
    const primaryBinary = binaryNames[0] || toolName;
    const finalPrimaryPath = path.join(context.installDir, primaryBinary);
    
    logger.debug(logs.installer.debug.movingBinary(), primarySourcePath, finalPrimaryPath);
    await fs.copyFile(primarySourcePath, finalPrimaryPath);
    
    // Handle additional binaries if any (for future multiple binary support)
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
    logger: TsLogger,
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