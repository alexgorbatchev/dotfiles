import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const installerDebugTemplates = {
  runningAfterDownloadHook: (): SafeLogMessage => 
    createSafeLogMessage('Running afterDownload hook'),
  extractingArchive: (): SafeLogMessage => 
    createSafeLogMessage('Extracting archive: %s'),
  archiveExtracted: (): SafeLogMessage => 
    createSafeLogMessage('Archive extracted: %o'),
  runningAfterExtractHook: (): SafeLogMessage => 
    createSafeLogMessage('Running afterExtract hook'),
  foundExecutable: (): SafeLogMessage => 
    createSafeLogMessage('Found executable in archive: %s'),
  makingExecutable: (): SafeLogMessage => 
    createSafeLogMessage('Making binary executable: %s'),
  movingBinary: (): SafeLogMessage => 
    createSafeLogMessage('Moving binary from %s to %s'),
  cleaningExtractDir: (): SafeLogMessage => 
    createSafeLogMessage('Cleaning up extractDir: %s'),
  cleaningArchive: (): SafeLogMessage => 
    createSafeLogMessage('Cleaning up downloaded archive: %s'),
  downloadingAsset: (): SafeLogMessage => 
    createSafeLogMessage('Downloading asset: %s from %s'),
  installingFromBrew: (): SafeLogMessage => 
    createSafeLogMessage('Installing from brew: toolName=%s, brewConfig=%o'),
  brewFormula: (): SafeLogMessage => 
    createSafeLogMessage('Formula: %s'),
  brewExecuting: (): SafeLogMessage => 
    createSafeLogMessage('Executing brew command: %s'),
  brewCompleted: (): SafeLogMessage => 
    createSafeLogMessage('Brew command completed successfully'),
  curlScriptDownloading: (): SafeLogMessage => 
    createSafeLogMessage('Downloading curl script from: %s'),
  curlScriptExecuting: (): SafeLogMessage => 
    createSafeLogMessage('Executing curl script: %s'),
  curlScriptCompleted: (): SafeLogMessage => 
    createSafeLogMessage('Curl script completed successfully'),
  installingFromCurl: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlScript: toolName=%s'),
  downloadingScript: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlScript: Downloading script from %s'),
  executingScript: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlScript: Executing script with %s'),
  installingFromCurlTar: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: toolName=%s'),
  downloadingTarball: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Downloading tarball from %s'),
  extractingTarball: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Extracting tarball'),
  tarballExtracted: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Tarball extracted: %o'),
  installingManually: (): SafeLogMessage => 
    createSafeLogMessage('installManually: toolName=%s'),
  executingCommand: (): SafeLogMessage => 
    createSafeLogMessage('installFromBrew: Executing command: %s'),
  assumingSingleBinary: (): SafeLogMessage => 
    createSafeLogMessage('installFromGitHubRelease: Assuming single extracted file is binary: %s'),
  noExecutableFound: (): SafeLogMessage => 
    createSafeLogMessage('installFromGitHubRelease: Could not find executable in extracted files: %o'),
  attemptingFallback: (): SafeLogMessage => 
    createSafeLogMessage('installFromGitHubRelease: Attempting fallback to find binary named like tool: %s'),
  scriptDownloaded: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlScript: Script downloaded to: %s'),
  scriptMadeExecutable: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlScript: Made script executable: %s'),
  noFallbackExecutable: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Could not find executable in extracted files: %o'),
  curlTarFallback: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Attempting fallback to find binary named like tool: %s'),
  githubReleaseBinaryMoving: (): SafeLogMessage => 
    createSafeLogMessage('installFromGitHubRelease: Moving binary from %s to %s'),
  githubReleaseFinalDestination: (): SafeLogMessage => 
    createSafeLogMessage('installFromGitHubRelease: Binary already at final destination: %s'),
  curlTarBinaryMoving: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Moving binary from %s to %s'),
  curlTarFinalDestination: (): SafeLogMessage => 
    createSafeLogMessage('installFromCurlTar: Binary already at final destination: %s'),
  manualMultipleBinariesNotSupported: (): SafeLogMessage => 
    createSafeLogMessage('Manual installation with multiple binaries not fully supported for %s'),
  binaryNotFound: (): SafeLogMessage => 
    createSafeLogMessage('Binary %s not found at %s, skipping'),
  directDownloadSingleBinary: (): SafeLogMessage => 
    createSafeLogMessage('Direct download only provides one binary, but %s were configured. Only %s will be available.'),
} as const;