import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const installerDebugTemplates = {
  runningAfterDownloadHook: () => createSafeLogMessage('Running afterDownload hook'),
  extractingArchive: () => createSafeLogMessage('Extracting archive: %s'),
  archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
  runningAfterExtractHook: () => createSafeLogMessage('Running afterExtract hook'),
  foundExecutable: () => createSafeLogMessage('Found executable in archive: %s'),
  makingExecutable: () => createSafeLogMessage('Making binary executable: %s'),
  movingBinary: () => createSafeLogMessage('Moving binary from %s to %s'),
  cleaningExtractDir: () => createSafeLogMessage('Cleaning up extractDir: %s'),
  cleaningArchive: () => createSafeLogMessage('Cleaning up downloaded archive: %s'),
  downloadingAsset: () => createSafeLogMessage('Downloading asset: %s from %s'),
  installingFromBrew: () => createSafeLogMessage('Installing from brew: toolName=%s, brewConfig=%o'),
  brewFormula: () => createSafeLogMessage('Formula: %s'),
  brewExecuting: () => createSafeLogMessage('Executing brew command: %s'),
  brewCompleted: () => createSafeLogMessage('Brew command completed successfully'),
  curlScriptDownloading: () => createSafeLogMessage('Downloading curl script from: %s'),
  curlScriptExecuting: () => createSafeLogMessage('Executing curl script: %s'),
  curlScriptCompleted: () => createSafeLogMessage('Curl script completed successfully'),
  installingFromCurl: () => createSafeLogMessage('installFromCurlScript: toolName=%s'),
  downloadingScript: () => createSafeLogMessage('installFromCurlScript: Downloading script from %s'),
  executingScript: () => createSafeLogMessage('installFromCurlScript: Executing script with %s'),
  installingFromCurlTar: () => createSafeLogMessage('installFromCurlTar: toolName=%s'),
  downloadingTarball: () => createSafeLogMessage('installFromCurlTar: Downloading tarball from %s'),
  extractingTarball: () => createSafeLogMessage('installFromCurlTar: Extracting tarball'),
  tarballExtracted: () => createSafeLogMessage('installFromCurlTar: Tarball extracted: %o'),
  installingManually: () => createSafeLogMessage('installManually: toolName=%s'),
  executingCommand: () => createSafeLogMessage('installFromBrew: Executing command: %s'),
  assumingSingleBinary: () =>
    createSafeLogMessage('installFromGitHubRelease: Assuming single extracted file is binary: %s'),
  noExecutableFound: () =>
    createSafeLogMessage('installFromGitHubRelease: Could not find executable in extracted files: %o'),
  attemptingFallback: () =>
    createSafeLogMessage('installFromGitHubRelease: Attempting fallback to find binary named like tool: %s'),
  scriptDownloaded: () => createSafeLogMessage('installFromCurlScript: Script downloaded to: %s'),
  scriptMadeExecutable: () => createSafeLogMessage('installFromCurlScript: Made script executable: %s'),
  noFallbackExecutable: () =>
    createSafeLogMessage('installFromCurlTar: Could not find executable in extracted files: %o'),
  curlTarFallback: () =>
    createSafeLogMessage('installFromCurlTar: Attempting fallback to find binary named like tool: %s'),
  githubReleaseBinaryMoving: () => createSafeLogMessage('installFromGitHubRelease: Moving binary from %s to %s'),
  githubReleaseFinalDestination: () =>
    createSafeLogMessage('installFromGitHubRelease: Binary already at final destination: %s'),
  curlTarBinaryMoving: () => createSafeLogMessage('installFromCurlTar: Moving binary from %s to %s'),
  curlTarFinalDestination: () => createSafeLogMessage('installFromCurlTar: Binary already at final destination: %s'),
  manualMultipleBinariesNotSupported: () =>
    createSafeLogMessage('Manual installation with multiple binaries not fully supported for %s'),
  binaryNotFound: () => createSafeLogMessage('Binary %s not found at %s, skipping'),
  directDownloadSingleBinary: () =>
    createSafeLogMessage(
      'Direct download only provides one binary, but %s were configured. Only %s will be available.'
    ),
  strippingComponent: () => createSafeLogMessage('Stripping component %s: navigating into %s'),
  stripComponentsSkipped: () => createSafeLogMessage('Skipping strip component %s: %s'),
} satisfies SafeLogMessageMap;
