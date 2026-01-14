import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';
export const messages = {
  binarySetupService: {
    binaryNotFound: (binaryName: string, pattern: string) =>
      createSafeLogMessage(`Binary ${binaryName} not found at ${pattern}, skipping`),
    extractedFilesTree: (extractDir: string, treeLines: string) =>
      createSafeLogMessage(`Extracted files in ${extractDir}:\n${treeLines}`),
    cleaningFailedInstall: (extractDir: string) =>
      createSafeLogMessage(`No binaries found, cleaning up installation directory: ${extractDir}`),
    fallbackCleanup: (extractDir: string) =>
      createSafeLogMessage(`Directory still exists after rm(), trying rmdir: ${extractDir}`),
    searchingWithPattern: (pattern: string, directoryPath: string) =>
      createSafeLogMessage(`Searching for binary using pattern ${pattern} in directory ${directoryPath}`),
    fallbackPattern: (pattern: string, directoryPath: string) =>
      createSafeLogMessage(`Trying fallback binary pattern ${pattern} in directory ${directoryPath}`),
    patternPathMissing: (missingPath: string) => createSafeLogMessage(`Pattern path does not exist: ${missingPath}`),
    noPatternMatch: (patternSegment: string, directoryPath: string) =>
      createSafeLogMessage(`No matches found for pattern ${patternSegment} in directory ${directoryPath}`),
    directDownloadSingleBinary: (configuredCount: number, primaryBinary: string) =>
      createSafeLogMessage(
        `Direct download only provides one binary, but ${configuredCount} were configured. Only ${primaryBinary} will be available.`,
      ),
    patternDebug: (pattern: string, parts: string[], extractDir: string) =>
      createSafeLogMessage(`Pattern: ${pattern}, Parts: [${parts.join(', ')}], ExtractDir: ${extractDir}`),
    processingPart: (part: string, currentDir: string) =>
      createSafeLogMessage(`Processing part: "${part}", currentDir: ${currentDir}`),
    wildcardMatchResult: (matchedDir: string | null) =>
      createSafeLogMessage(`Wildcard match result: ${matchedDir ?? 'null'}`),
    directPath: (currentDir: string) => createSafeLogMessage(`Direct path: ${currentDir}`),
    finalResult: (currentDir: string) => createSafeLogMessage(`Final result: ${currentDir}`),
  } satisfies SafeLogMessageMap,
  binarySymlink: {
    targetBinaryMissing: (toolName: string, binaryName: string, targetPath: string) =>
      createSafeLogMessage(
        `Cannot create entrypoint for ${toolName}/${binaryName}: target binary missing at ${targetPath}`,
      ),
    removingExisting: (symlinkPath: string) => createSafeLogMessage(`Removing old entrypoint: ${symlinkPath}`),
    removeExistingFailed: (symlinkPath: string) =>
      createSafeLogMessage(`Failed to remove old entrypoint ${symlinkPath}`),
    creating: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Creating entrypoint: ${symlinkPath} <- ${targetPath}`),
    creationFailed: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Failed to create entrypoint ${symlinkPath} <- ${targetPath}`),
    verificationMismatch: (symlinkPath: string, expectedTarget: string, actualTarget: string) =>
      createSafeLogMessage(`Entrypoint ${symlinkPath} is ${actualTarget}, expected ${expectedTarget}`),
    verificationFailed: (symlinkPath: string) => createSafeLogMessage(`Failed to verify entrypoint ${symlinkPath}`),
    createdAndVerified: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Successfully created and verified entrypoint: ${symlinkPath} <- ${targetPath}`),
  } satisfies SafeLogMessageMap,
  lifecycle: {
    startingInstallation: (toolName: string) => createSafeLogMessage(`Starting installation for ${toolName}`),
    hookExecution: (hookName: string) => createSafeLogMessage(`install: Running ${hookName} hook`),
    directoryCreated: (directoryPath: string) =>
      createSafeLogMessage(`install: Created installation directory: ${directoryPath}`),
    directoryRenamed: (oldPath: string, newPath: string) =>
      createSafeLogMessage(`install: Renamed installation directory from ${oldPath} to ${newPath}`),
    cleaningFailedInstallDir: (directoryPath: string) =>
      createSafeLogMessage(`install: Cleaning up failed installation directory: ${directoryPath}`),
    versionResolved: (version: string) => createSafeLogMessage(`install: Resolved version: ${version}`),
    versionFallbackToTimestamp: () =>
      createSafeLogMessage('install: Version resolution returned null, using timestamp'),
    versionResolutionFailed: (error: unknown) =>
      createSafeLogMessage(`install: Version resolution failed, using timestamp: ${String(error)}`),
    externalBinaryMissing: (toolName: string, binaryName: string, binaryPath: string) =>
      createSafeLogMessage(
        `Cannot create symlink for ${toolName}/${binaryName}: external binary missing at ${binaryPath}`,
      ),
    removingExistingSymlink: (symlinkPath: string) => createSafeLogMessage(`Removing existing symlink: ${symlinkPath}`),
    creatingExternalSymlink: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Creating external symlink: ${symlinkPath} -> ${targetPath}`),
    symlinkVerificationFailed: (symlinkPath: string) =>
      createSafeLogMessage(`Symlink verification failed: ${symlinkPath}`),
    externalSymlinkCreated: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`External symlink created: ${symlinkPath} -> ${targetPath}`),
  } satisfies SafeLogMessageMap,
  outcome: {
    installSuccess: (toolName: string, version: string, method: string) =>
      createSafeLogMessage(`Tool "${toolName}" v${version} installed successfully using ${method}`),
    outdatedVersion: (toolName: string, currentVersion: string, latestVersion: string) =>
      createSafeLogMessage(`Tool "${toolName}" version ${currentVersion} is outdated (latest: ${latestVersion})`),
    installFailed: (method: string) => createSafeLogMessage(`Installation failed via ${method}`),
    hookFailed: (cause: string) => createSafeLogMessage(`Hook failed: ${cause}`),
    unsupportedOperation: (operation: string, details: string) =>
      createSafeLogMessage(`${operation} not yet supported (${details})`),
  } satisfies SafeLogMessageMap,

  archive: {
    extracting: (pathOrName: string) => createSafeLogMessage(`Extracting archive: ${pathOrName}`),
    extracted: () => createSafeLogMessage('Archive extracted: %o'),
    cleaning: (resourcePath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${resourcePath}`),
  } satisfies SafeLogMessageMap,

  binaryMovement: {
    moving: (sourcePath: string, targetPath: string) =>
      createSafeLogMessage(`Moving binary from ${sourcePath} to ${targetPath}`),
  } satisfies SafeLogMessageMap,

  completion: {
    noCompletionsConfigured: () => createSafeLogMessage('install: no completions configured'),
    generatingCompletions: (count: number) => createSafeLogMessage(`install: generating ${count} completion files`),
    generatedCompletion: (filename: string, targetPath: string) =>
      createSafeLogMessage(`install: generated completion: ${filename} -> ${targetPath}`),
    symlinking: (shellType: string, sourcePath: string, targetFile: string) =>
      createSafeLogMessage(`Symlinking completion for ${shellType} from ${sourcePath} to ${targetFile}`),
    notFound: (sourcePath: string) => createSafeLogMessage(`Completion file not found: ${sourcePath}`),
    directoryListing: (filePath: string) => createSafeLogMessage(`  ${filePath}`),
  } satisfies SafeLogMessageMap,
  hookExecutor: {
    executingHook: (hookName: string, timeoutMs: number) =>
      createSafeLogMessage(`Executing ${hookName} hook with ${timeoutMs}ms timeout`),
    hookCompleted: (hookName: string, durationMs: number) =>
      createSafeLogMessage(`Hook ${hookName} completed successfully in ${durationMs}ms`),
    continuingDespiteFailure: (hookName: string) =>
      createSafeLogMessage(`Continuing installation despite ${hookName} hook failure`),
    stoppingDueToFailure: (hookName: string) =>
      createSafeLogMessage(`Stopping hook execution due to failure in ${hookName} hook`),
    timeoutExceeded: (hookName: string, timeoutMs: number) =>
      createSafeLogMessage(`Hook ${hookName} timed out after ${timeoutMs}ms`),
  } satisfies SafeLogMessageMap,
} as const;
