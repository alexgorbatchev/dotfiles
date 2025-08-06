import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';

/**
 * Internal function to create SafeLogMessage objects.
 * This should only be used within template functions.
 */
function createSafeLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}

/**
 * Standardized error message templates for consistent logging across the application.
 * 
 * All template functions return SafeLogMessage objects that are type-safe for use with
 * the SafeTsLogger. This prevents arbitrary strings from being passed to log methods.
 * 
 * Usage:
 * ```typescript
 * import { ErrorTemplates } from '@modules/shared/ErrorTemplates';
 * 
 * // Type-safe logging - only SafeLogMessage accepted as first argument:
 * logger.error(ErrorTemplates.tool.installFailed('github-release', toolName, error.message));
 * logger.debug('Installation error details: %O', error); // Additional template args still work
 * 
 * // This would cause a TypeScript error:
 * logger.error('Raw string not allowed'); // ❌ Type error!
 * ```
 */
export const ErrorTemplates = {
  /**
   * Tool lifecycle operations (install, update, cleanup, conflicts)
   */
  tool: {
    installFailed: (method: string, toolName: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Installation failed [${method}] for tool "${toolName}": ${reason}`),
    updateFailed: (toolName: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Update failed for tool "${toolName}": ${reason}`),
    cleanupFailed: (toolName: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Cleanup failed for tool "${toolName}": ${reason}`),
    conflictDetected: (toolName: string, conflict: string): SafeLogMessage => 
      createSafeLogMessage(`Conflict detected for tool "${toolName}": ${conflict}`),
    notFound: (toolName: string, source: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" not found in ${source}`),
    versionNotFound: (toolName: string, version: string, source: string): SafeLogMessage => 
      createSafeLogMessage(`Version "${version}" of tool "${toolName}" not found in ${source}`),
    installationCorrupted: (toolName: string, path: string): SafeLogMessage => 
      createSafeLogMessage(`Installation of tool "${toolName}" appears corrupted at ${path}`),
    dependencyMissing: (toolName: string, dependency: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" requires missing dependency: ${dependency}`),
  },

  /**
   * File system operations (read, write, symlinks, permissions)
   */
  fs: {
    notFound: (itemType: string, path: string): SafeLogMessage => 
      createSafeLogMessage(`${itemType} not found: ${path}`),
    accessDenied: (operation: string, path: string): SafeLogMessage => 
      createSafeLogMessage(`Access denied ${operation}: ${path}`),
    readFailed: (path: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to read ${path}: ${reason}`),
    writeFailed: (path: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to write ${path}: ${reason}`),
    symlinkFailed: (source: string, target: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to create symlink ${source} → ${target}: ${reason}`),
    symlinkCorrupted: (target: string, expected: string, actual: string): SafeLogMessage => 
      createSafeLogMessage(`Symlink ${target} points to "${actual}", expected "${expected}"`),
    permissionsFailed: (path: string, permissions: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to set permissions ${permissions} on ${path}: ${reason}`),
    directoryCreateFailed: (path: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to create directory ${path}: ${reason}`),
    deleteFailed: (path: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to delete ${path}: ${reason}`),
  },

  /**
   * Configuration loading and validation
   */
  config: {
    validationFailed: (errors: string[]): SafeLogMessage => 
      createSafeLogMessage(`Configuration validation failed:\n${errors.join('\n')}`),
    loadFailed: (configPath: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to load configuration from ${configPath}: ${reason}`),
    required: (field: string, example?: string): SafeLogMessage => 
      createSafeLogMessage(`Required configuration missing: ${field}${example ? `. Example: ${example}` : ''}`),
    invalid: (field: string, value: string, expected: string): SafeLogMessage => 
      createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
    parseErrors: (configPath: string, format: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to parse ${format} configuration ${configPath}: ${reason}`),
    schemaError: (field: string, issue: string): SafeLogMessage => 
      createSafeLogMessage(`Configuration schema error in ${field}: ${issue}`),
  },

  /**
   * External service integrations
   */
  service: {
    github: {
      apiFailed: (operation: string, status: number, message: string): SafeLogMessage => 
        createSafeLogMessage(`GitHub API failed [${operation}] ${status}: ${message}`),
      rateLimited: (resetTime: string): SafeLogMessage => 
        createSafeLogMessage(`GitHub API rate limited. Resets at ${resetTime}`),
      unauthorized: (): SafeLogMessage => createSafeLogMessage('GitHub API authentication failed. Check your token'),
      notFound: (resource: string, identifier: string): SafeLogMessage => 
        createSafeLogMessage(`GitHub ${resource} not found: ${identifier}`),
      networkError: (operation: string, reason: string): SafeLogMessage => 
        createSafeLogMessage(`GitHub API network error [${operation}]: ${reason}`),
      quotaExceeded: (quotaType: string, limit: number): SafeLogMessage => 
        createSafeLogMessage(`GitHub API ${quotaType} quota exceeded (limit: ${limit})`),
    },
    network: {
      downloadFailed: (url: string, reason: string): SafeLogMessage => 
        createSafeLogMessage(`Download failed from ${url}: ${reason}`),
      timeoutExceeded: (operation: string, timeout: number): SafeLogMessage => 
        createSafeLogMessage(`${operation} timed out after ${timeout}ms`),
      connectionFailed: (host: string, reason: string): SafeLogMessage => 
        createSafeLogMessage(`Connection failed to ${host}: ${reason}`),
      invalidUrl: (url: string): SafeLogMessage => 
        createSafeLogMessage(`Invalid URL: ${url}`),
      checksumMismatch: (file: string, expected: string, actual: string): SafeLogMessage => 
        createSafeLogMessage(`Checksum mismatch for ${file}: expected ${expected}, got ${actual}`),
    },
  },

  /**
   * Command execution and CLI
   */
  command: {
    executionFailed: (command: string, exitCode: number, stderr: string): SafeLogMessage => 
      createSafeLogMessage(`Command failed [${command}] exit ${exitCode}: ${stderr}`),
    notFound: (command: string): SafeLogMessage => 
      createSafeLogMessage(`Command not found: ${command}`),
    permissionDenied: (command: string): SafeLogMessage => 
      createSafeLogMessage(`Permission denied executing: ${command}`),
    invalidArgs: (command: string, provided: string, expected: string): SafeLogMessage => 
      createSafeLogMessage(`Invalid arguments for ${command}: provided "${provided}", expected ${expected}`),
    timeout: (command: string, timeoutMs: number): SafeLogMessage => 
      createSafeLogMessage(`Command timed out [${command}] after ${timeoutMs}ms`),
    interruptedByUser: (command: string): SafeLogMessage => 
      createSafeLogMessage(`Command interrupted by user: ${command}`),
  },

  /**
   * Archive and extraction operations
   */
  archive: {
    extractFailed: (archivePath: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to extract archive ${archivePath}: ${reason}`),
    unsupportedFormat: (archivePath: string, detectedFormat: string): SafeLogMessage => 
      createSafeLogMessage(`Unsupported archive format: ${archivePath} (detected: ${detectedFormat})`),
    corruptedArchive: (archivePath: string): SafeLogMessage => 
      createSafeLogMessage(`Archive appears corrupted: ${archivePath}`),
    extractPathNotFound: (archivePath: string, extractPath: string): SafeLogMessage => 
      createSafeLogMessage(`Extract path not found in archive ${archivePath}: ${extractPath}`),
    noExecutablesFound: (archivePath: string): SafeLogMessage => 
      createSafeLogMessage(`No executable files found in archive: ${archivePath}`),
  },

  /**
   * Cache operations
   */
  cache: {
    retrievalFailed: (key: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error retrieving cache for key: ${key}, error: ${reason}`),
    storageFailed: (key: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error caching data for key: ${key}, error: ${reason}`),
    checkFailed: (key: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error checking cache for key: ${key}, error: ${reason}`),
    deleteFailed: (key: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error deleting cache entry for key: ${key}, error: ${reason}`),
    clearExpiredFailed: (reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error clearing expired cache entries: ${reason}`),
    clearFailed: (reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error clearing cache: ${reason}`),
    directoryCreationFailed: (reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error ensuring cache directories exist: ${reason}`),
    contentHashMismatch: (key: string, expected: string, actual: string): SafeLogMessage => 
      createSafeLogMessage(`Content hash mismatch for key: ${key}, expected: ${expected}, actual: ${actual}`),
    binaryFileNotConfigured: (): SafeLogMessage => 
      createSafeLogMessage('Binary directory not configured for binary strategy'),
    binaryDataRequired: (): SafeLogMessage => 
      createSafeLogMessage('Binary storage strategy requires Buffer data'),
    fileProcessingError: (file: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error processing cache file ${file}: ${reason}`),
  },
} as const;

/**
 * Debug message templates for trace/debug level logging
 */
export const DebugTemplates = {
  cache: {
    disabled: (operation: string, key: string): SafeLogMessage => 
      createSafeLogMessage(`Cache disabled, ${operation} for key: ${key}`),
    notFound: (key: string): SafeLogMessage => 
      createSafeLogMessage(`No cache entry found for key: ${key}`),
    expired: (key: string): SafeLogMessage => 
      createSafeLogMessage(`Cache entry expired for key: ${key}`),
    binaryFileMissing: (key: string, path: string): SafeLogMessage => 
      createSafeLogMessage(`Binary file missing for key: ${key}, path: ${path}`),
    directoryNotExist: (): SafeLogMessage => 
      createSafeLogMessage('Cache directory does not exist, nothing to clear'),
    noEntryToDelete: (key: string): SafeLogMessage => 
      createSafeLogMessage(`No cache entry to delete for key: ${key}`),
    constructorDebug: (cacheDir: string, ttl: number, strategy: string, enabled: boolean): SafeLogMessage => 
      createSafeLogMessage(`Cache directory: ${cacheDir}, TTL: ${ttl} ms, Strategy: ${strategy}, Enabled: ${enabled}`),
    fileProcessingError: (file: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Error processing cache file ${file}: ${reason}`),
    cachedDownloadStrategyCreated: (strategyName: string, ttl: number): SafeLogMessage => 
      createSafeLogMessage(`Wrapping strategy ${strategyName} with cache, TTL: ${ttl} ms`),
  },
  downloader: {
    fileExists: (exists: boolean): SafeLogMessage => 
      createSafeLogMessage(`Downloaded file exists: ${exists}`),
    fileCached: (): SafeLogMessage => 
      createSafeLogMessage('Successfully read file for caching'),
    strategyCreated: (strategy: string, hasCache: boolean): SafeLogMessage => 
      createSafeLogMessage(`constructor: Created ${strategy}${hasCache ? ' wrapping NodeFetchStrategy' : ' (no cache)'}`),
    downloadStarted: (): SafeLogMessage => 
      createSafeLogMessage('Downloading URL: %s'),
    downloadToFileStarted: (): SafeLogMessage => 
      createSafeLogMessage('Downloading URL %s to file: %s'),
    errorCreated: (errorType: string): SafeLogMessage => 
      createSafeLogMessage(`${errorType} created: message=%s, url=%s`),
    networkErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('NetworkError created: message=%s, url=%s, originalError=%o'),
    httpErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('HttpError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
    notFoundErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('NotFoundError created: url=%s, responseBody=%o, responseHeaders=%o'),
    forbiddenErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('ForbiddenError created: url=%s, responseBody=%o, responseHeaders=%o'),
    rateLimitErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('RateLimitError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o, resetTimestamp=%d'),
    clientErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('ClientError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
    serverErrorCreated: (): SafeLogMessage => 
      createSafeLogMessage('ServerError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o'),
    // NodeFetchStrategy debug messages
    constructorDebug: (): SafeLogMessage => 
      createSafeLogMessage('constructor: fileSystem=%o'),
    fetchProgress: (): SafeLogMessage => 
      createSafeLogMessage('fetch progress: %s'),
    fetchStarted: (): SafeLogMessage => 
      createSafeLogMessage('fetch started for URL: %s'),
    responseReceived: (): SafeLogMessage => 
      createSafeLogMessage('response received: %s'),
    responseProcessing: (): SafeLogMessage => 
      createSafeLogMessage('processing response for URL: %s'),
    downloadTimeout: (): SafeLogMessage => 
      createSafeLogMessage('Download timeout for %s'),
    downloadAttempt: (): SafeLogMessage => 
      createSafeLogMessage('Attempt %d: Downloading %s'),
    responseBodyReadFailed: (): SafeLogMessage => 
      createSafeLogMessage('Failed to read response body for error: %s, error: %o'),
    downloadFailed: (): SafeLogMessage => 
      createSafeLogMessage('Download failed: url=%s, statusCode=%d, statusText=%s, responseBody=%s'),
    downloadSuccessful: (): SafeLogMessage => 
      createSafeLogMessage('Download successful for %s, size: %d bytes'),
    savingToDestination: (): SafeLogMessage => 
      createSafeLogMessage('Saving to destination: %s'),
    savedSuccessfully: (): SafeLogMessage => 
      createSafeLogMessage('Successfully wrote to %s using IFileSystem'),
    downloadAttemptError: (): SafeLogMessage => 
      createSafeLogMessage('Error during download attempt %d for %s: %o'),
    retryingDownload: (): SafeLogMessage => 
      createSafeLogMessage('Retrying download for %s, attempt %d/%d after %dms'),
    exhaustedRetries: (): SafeLogMessage => 
      createSafeLogMessage('Exhausted retries for %s'),
  },
  command: {
    actionStarted: (commandName: string, targetTool?: string): SafeLogMessage => 
      createSafeLogMessage(`${commandName} command action logic started${targetTool ? `. Tool: ${targetTool}` : ''}`),
    versionComparisonDebug: (toolName: string, configured: string, latest: string): SafeLogMessage => 
      createSafeLogMessage(`Tool: ${toolName}, Configured: ${configured}, Latest: ${latest}`),
    githubApiError: (toolName: string): SafeLogMessage => 
      createSafeLogMessage(`GitHub API error details for ${toolName}: %O`),
    unsupportedMethod: (toolName: string, method: string): SafeLogMessage => 
      createSafeLogMessage(`Update checking not yet supported for ${toolName} (method: ${method})`),
    actionCalled: (commandName: string, targetTool?: string): SafeLogMessage => 
      createSafeLogMessage(`Action called for ${commandName}${targetTool ? ` "${targetTool}"` : ''} with options: %O`),
    unhandledError: (): SafeLogMessage => 
      createSafeLogMessage('Unhandled error in action handler: %O'),
    errorDetails: (): SafeLogMessage => 
      createSafeLogMessage('Error details: %O'),
    configErrorDetails: (): SafeLogMessage => 
      createSafeLogMessage('Configuration loading error details: %O'),
    // Cleanup command specific templates
    cleanupStarted: (dryRun: boolean): SafeLogMessage => 
      createSafeLogMessage(`starting cleanup process, dryRun=${dryRun}: %O`),
    cleanupFinished: (dryRun: boolean): SafeLogMessage => 
      createSafeLogMessage(`cleanup process finished, dryRun=${dryRun}`),
    manifestRead: (): SafeLogMessage => 
      createSafeLogMessage('manifest file read and parsed successfully'),
    manifestMissing: (): SafeLogMessage => 
      createSafeLogMessage('manifest file does not exist'),
    manifestError: (): SafeLogMessage => 
      createSafeLogMessage('error reading or parsing manifest file: %s'),
    fileDeletion: (filePath: string, success: boolean, dryRun: boolean): SafeLogMessage => {
      if (dryRun) return createSafeLogMessage(`would delete ${filePath} (dry run)`);
      if (success) return createSafeLogMessage(`deleted ${filePath}`);
      return createSafeLogMessage(`error deleting ${filePath}: %s`);
    },
    fileNotFound: (filePath: string): SafeLogMessage => 
      createSafeLogMessage(`file not found ${filePath}`),
    foundFiles: (count: number, toolName: string, fileType?: string): SafeLogMessage => 
      createSafeLogMessage(`Found ${count} files for tool '${toolName}'${fileType ? ` of type '${fileType}'` : ''}`),
    shimDeletion: (shimPath: string, success: boolean, dryRun: boolean): SafeLogMessage => {
      if (dryRun) return createSafeLogMessage(`would delete shim ${shimPath} (dry run)`);
      if (success) return createSafeLogMessage(`deleted shim ${shimPath}`);
      return createSafeLogMessage(`error deleting shim ${shimPath}: %s`);
    },
    shellInitDeletion: (initPath: string, success: boolean, dryRun: boolean): SafeLogMessage => {
      if (dryRun) return createSafeLogMessage(`would delete shell init ${initPath} (dry run)`);
      if (success) return createSafeLogMessage(`deleted shell init ${initPath}`);
      return createSafeLogMessage(`error deleting shell init ${initPath}: %s`);
    },
    symlinkDeletion: (symlinkPath: string, success: boolean, dryRun: boolean): SafeLogMessage => {
      if (dryRun) return createSafeLogMessage(`would delete symlink ${symlinkPath} (dry run)`);
      if (success) return createSafeLogMessage(`deleted symlink ${symlinkPath}`);
      return createSafeLogMessage(`error deleting symlink ${symlinkPath}: %s`);
    },
    shimNotFound: (shimPath: string): SafeLogMessage => 
      createSafeLogMessage(`shim not found ${shimPath}`),
    shellInitNotFound: (initPath: string): SafeLogMessage => 
      createSafeLogMessage(`shell init file not found ${initPath}`),
    symlinkNotFound: (symlinkPath: string): SafeLogMessage => 
      createSafeLogMessage(`symlink target not found ${symlinkPath}`),
    // Installer-specific debug messages
    installerConstructor: (): SafeLogMessage => 
      createSafeLogMessage('constructor: fileSystem=%s, downloader=%s, githubApiClient=%s, archiveExtractor=%s, appConfig=%o'),
    installDebug: (operation: string): SafeLogMessage => 
      createSafeLogMessage(`install: ${operation}`),
    installMethodDebug: (method: string, operation: string): SafeLogMessage => 
      createSafeLogMessage(`${method}: ${operation}`),
    hookExecution: (hookName: string): SafeLogMessage => 
      createSafeLogMessage(`install: Running ${hookName} hook`),
    directoryCreated: (): SafeLogMessage => 
      createSafeLogMessage(`install: Created installation directory: %s`),
    methodStarted: (): SafeLogMessage => 
      createSafeLogMessage('Starting with toolName=%s'),
    methodDebugParams: (): SafeLogMessage => 
      createSafeLogMessage('toolName=%s, toolConfig=%o, options=%o'),
    gitHubReleaseLatest: (): SafeLogMessage => 
      createSafeLogMessage('Getting latest release for %s'),
    gitHubReleaseDetails: (): SafeLogMessage => 
      createSafeLogMessage('Latest release for %s is %s (published %s)'),
    assetSelectorCustom: (): SafeLogMessage => 
      createSafeLogMessage('Using custom asset selector'),
    assetSelectorFound: (): SafeLogMessage => 
      createSafeLogMessage('Selected asset: %s'),
    downloadStarted: (): SafeLogMessage => 
      createSafeLogMessage('Downloading %s from %s'),
    assetPatternMatch: (): SafeLogMessage => 
      createSafeLogMessage('Finding asset matching pattern: %s'),
    assetPlatformMatch: (): SafeLogMessage => 
      createSafeLogMessage('Finding asset for platform %s and architecture %s'),
    // Specific structured debug messages for installer operations
    determiningDownloadUrl: (): SafeLogMessage => 
      createSafeLogMessage('Determining download URL. rawBrowserDownloadUrl="%s", customHost="%s"'),
    usingAbsoluteUrl: (): SafeLogMessage => 
      createSafeLogMessage('Using absolute browser_download_url directly: "%s"'),
    resolvedRelativeUrl: (): SafeLogMessage => 
      createSafeLogMessage('Resolved relative URL. Base: "%s", Relative Path: "%s", Result: "%s"'),
    invalidUrlFormat: (): SafeLogMessage => 
      createSafeLogMessage('Invalid or unsupported browser_download_url format: "%s"'),
    finalDownloadUrl: (): SafeLogMessage => 
      createSafeLogMessage('Final download URL determined. Raw: "%s", Configured Host: "%s", Result: "%s"'),
    downloadUrlError: (): SafeLogMessage => 
      createSafeLogMessage('Download URL construction error details: Raw: "%s", Configured Host: "%s", Error: %s'),
    downloadingAsset: (): SafeLogMessage => 
      createSafeLogMessage('Downloading asset: %s'),
    platformInfo: (): SafeLogMessage => 
      createSafeLogMessage('Platform: %s, Architecture: %s'),
    assetFound: (): SafeLogMessage => 
      createSafeLogMessage('Found matching asset: %s'),
    downloadProgress: (): SafeLogMessage => 
      createSafeLogMessage('Downloading %s to %s'),
  },
  extractor: {
    extractStarted: (): SafeLogMessage => 
      createSafeLogMessage('Extracting %s using format %s'),
    formatDetected: (): SafeLogMessage => 
      createSafeLogMessage('Detected archive format: %s for file: %s'),
    extractionCompleted: (): SafeLogMessage => 
      createSafeLogMessage('Extraction completed in %s ms'),
    fileExecutableCheck: (): SafeLogMessage => 
      createSafeLogMessage('Checking if file is executable: %s'),
    commandExecution: (): SafeLogMessage => 
      createSafeLogMessage('Executing command: %s'),
    fileContent: (): SafeLogMessage => 
      createSafeLogMessage('File content preview (first 200 bytes): %s'),
    executionResult: (): SafeLogMessage => 
      createSafeLogMessage('Command result: stdout=%s, stderr=%s'),
    commandError: (): SafeLogMessage => 
      createSafeLogMessage('executeShellCommand error: %o'),
    fileCommandFailed: (): SafeLogMessage => 
      createSafeLogMessage('"file" command failed during fallback. Error: %o'),
    extractingArchive: (): SafeLogMessage => 
      createSafeLogMessage('Extracting %s to %s using format %s'),
    extractionTime: (): SafeLogMessage => 
      createSafeLogMessage('Extraction took %d ms'),
    findingExecutables: (): SafeLogMessage => 
      createSafeLogMessage('Finding executable files in %s'),
    checkingExecutable: (): SafeLogMessage => 
      createSafeLogMessage('Checking if %s is executable'),
    executableDetails: (): SafeLogMessage => 
      createSafeLogMessage('File %s - size: %d, isExecutable: %s'),
    zipStripComponents: (): SafeLogMessage => 
      createSafeLogMessage('--strip-components is not directly supported for zip, files will be extracted with full paths into target.'),
    debugArchivePath: (): SafeLogMessage => 
      createSafeLogMessage('archivePath=%s, options=%o'),
    extractErrorCleanup: (): SafeLogMessage => 
      createSafeLogMessage('Error during extract process, cleaning up temp dir: %s. Error: %o'),
    cleanupError: (): SafeLogMessage => 
      createSafeLogMessage('Error during cleanup of temp dir after an error: %o'),
    settingExecutable: (): SafeLogMessage => 
      createSafeLogMessage('Setting +x for %s'),
    fileStatError: (): SafeLogMessage => 
      createSafeLogMessage('Error stating or chmoding file %s: %o'),
  },
  generator: {
    orchestratorInit: (): SafeLogMessage => 
      createSafeLogMessage('Initializing GeneratorOrchestrator'),
    configCritical: (): SafeLogMessage => 
      createSafeLogMessage('CRITICAL - appConfig is null/undefined at method start'),
    pathsCritical: (): SafeLogMessage => 
      createSafeLogMessage('CRITICAL: paths.manifestPath is undefined/null on appConfig'),
    manifestRead: (): SafeLogMessage => 
      createSafeLogMessage('Proceeding with manifest read/init using %s'),
    readFileCompleted: (): SafeLogMessage => 
      createSafeLogMessage('readFile call completed'),
    existingManifest: (): SafeLogMessage => 
      createSafeLogMessage('Existing manifest read and parsed successfully'),
    shimGenerate: (): SafeLogMessage => 
      createSafeLogMessage('Calling shimGenerator.generate with options: %o'),
    shellGenerate: (): SafeLogMessage => 
      createSafeLogMessage('Calling shellInitGenerator.generate with options: %o'),
    symlinkGenerate: (): SafeLogMessage => 
      createSafeLogMessage('Calling symlinkGenerator.generate with options: %o'),
    manifestWritten: (): SafeLogMessage => 
      createSafeLogMessage('Manifest written successfully'),
    orchestrationComplete: (): SafeLogMessage => 
      createSafeLogMessage('Orchestration complete using %s'),
    methodEntry: (): SafeLogMessage => 
      createSafeLogMessage('Method entry. Options: %o, FileSystem: %s'),
    manifestPath: (): SafeLogMessage => 
      createSafeLogMessage('Initial appConfig.paths.manifestPath: %s'),
    parsedOptions: (): SafeLogMessage => 
      createSafeLogMessage('Parsed options: generatorVersion=%s, toolConfigsCount=%d'),
    yamlConfigAvailable: (): SafeLogMessage => 
      createSafeLogMessage('YamlConfig available. paths.manifestPath: %s'),
    manifestPathDetermined: (): SafeLogMessage => 
      createSafeLogMessage('Manifest path determined as: %s'),
    fsExistsCompleted: (): SafeLogMessage => 
      createSafeLogMessage('fs.exists call completed. manifestFileExists = %s'),
    existingManifestFound: (): SafeLogMessage => 
      createSafeLogMessage('Existing manifest found at %s. Reading...'),
    noExistingManifest: (): SafeLogMessage => 
      createSafeLogMessage('No existing manifest found at %s. Creating a new one'),
    manifestReadError: (): SafeLogMessage => 
      createSafeLogMessage('Error reading or parsing existing manifest at %s. Defaulting to a new manifest. Error: %s'),
    shimGenerationComplete: (): SafeLogMessage => 
      createSafeLogMessage('Shim generation complete. %d shims recorded'),
    shellInitComplete: (): SafeLogMessage => 
      createSafeLogMessage('Shell init generation complete. Recorded path: %s'),
    symlinkGenerationComplete: (): SafeLogMessage => 
      createSafeLogMessage('Symlink generation complete. %d symlink operations recorded'),
    writingManifest: (): SafeLogMessage => 
      createSafeLogMessage('Writing updated manifest to %s using %s'),
    manifestWriteFailed: (): SafeLogMessage => 
      createSafeLogMessage('Failed to write manifest to %s. Error: %s'),
  },
  registry: {
    initialized: (): SafeLogMessage => 
      createSafeLogMessage('Initialized SQLite file registry at: %s'),
    operationRecorded: (): SafeLogMessage => 
      createSafeLogMessage('Recorded %s operation for %s: %s'),
    operationsRetrieved: (): SafeLogMessage => 
      createSafeLogMessage('Retrieved %d operations with filter: %o'),
    fileStatesComputed: (): SafeLogMessage => 
      createSafeLogMessage('Computed %d file states for tool: %s'),
    toolsFound: (): SafeLogMessage => 
      createSafeLogMessage('Found %d registered tools'),
    operationsRemoved: (): SafeLogMessage => 
      createSafeLogMessage('Removed %d operations for tool: %s'),
    compactionComplete: (): SafeLogMessage => 
      createSafeLogMessage('Compaction complete: %d -> %d operations'),
    validationComplete: (): SafeLogMessage => 
      createSafeLogMessage('Validation complete: %d issues found, %d repaired'),
    noOperationsFound: (): SafeLogMessage => 
      createSafeLogMessage('No operations found for file: %s'),
    fileStateComputed: (): SafeLogMessage => 
      createSafeLogMessage('Computed file state for %s: %s'),
    registryClosed: (): SafeLogMessage => 
      createSafeLogMessage('Closed SQLite file registry'),
    schemaInitialized: (): SafeLogMessage => 
      createSafeLogMessage('Schema initialization complete'),
    trackedFsCreated: (): SafeLogMessage => 
      createSafeLogMessage('Created tracked filesystem for tool: %s'),
    rmdirTracked: (): SafeLogMessage => 
      createSafeLogMessage('Tracked rmdir operation: %s'),
    directoryDeletionError: (): SafeLogMessage => 
      createSafeLogMessage('Error tracking directory deletion %s: %s'),
  },
  shellInit: {
    constructorDebug: (): SafeLogMessage => 
      createSafeLogMessage('fileSystem=%o, appConfig=%o'),
    generateDebug: (): SafeLogMessage => 
      createSafeLogMessage('toolConfigs=%o, options=%o, FileSystem: %s'),
    outputPath: (): SafeLogMessage => 
      createSafeLogMessage('outputPath=%s'),
    processingTool: (): SafeLogMessage => 
      createSafeLogMessage('processing tool=%s, config=%o'),
    skippingUndefined: (): SafeLogMessage => 
      createSafeLogMessage('skipping undefined config for toolName=%s'),
    writingFile: (): SafeLogMessage => 
      createSafeLogMessage('Writing to %s using %s with content:\n%s'),
    writeSuccess: (): SafeLogMessage => 
      createSafeLogMessage('Successfully wrote Zsh init file to %s using %s'),
    writeError: (): SafeLogMessage => 
      createSafeLogMessage('ERROR: Failed to write Zsh init file to %s using %s. Error: %s'),
    processCompletions: (): SafeLogMessage => 
      createSafeLogMessage('toolName=%s, completions=%o'),
    fpathAdded: (): SafeLogMessage => 
      createSafeLogMessage('Added %s to fpath for tool %s'),
  },
  shim: {
    constructorDebug: (): SafeLogMessage => 
      createSafeLogMessage('fileSystem=%o, config=%o'),
    generateDebug: (): SafeLogMessage => 
      createSafeLogMessage('toolConfigs=%o, options=%o'),
    toolConfigUndefined: (): SafeLogMessage => 
      createSafeLogMessage('toolConfig for %s is undefined. Skipping.'),
    generateForToolDebug: (): SafeLogMessage => 
      createSafeLogMessage('toolName=%s, toolConfig=%o, options=%o, FileSystem: %s'),
    shimFilePath: (): SafeLogMessage => 
      createSafeLogMessage('shimFilePath=%s'),
    shimExists: (): SafeLogMessage => 
      createSafeLogMessage('Shim already exists at %s and overwrite is false. Skipping.'),
    toolBinPath: (): SafeLogMessage => 
      createSafeLogMessage('toolBinPath=%s'),
    shimContent: (): SafeLogMessage => 
      createSafeLogMessage('shimContent=\n%s'),
    writingShim: (): SafeLogMessage => 
      createSafeLogMessage('Writing shim file to %s using %s'),
    makingExecutable: (): SafeLogMessage => 
      createSafeLogMessage('Making shim executable: chmod +x %s using %s'),
    shimSuccess: (): SafeLogMessage => 
      createSafeLogMessage('Shim for %s generated successfully at %s (using %s).'),
  },
  symlink: {
    constructorInit: (): SafeLogMessage => 
      createSafeLogMessage('SymlinkGenerator initialized'),
    generateStart: (): SafeLogMessage => 
      createSafeLogMessage('Starting symlink generation. Options: %o, FileSystem: %s'),
    toolConfigUndefined: (): SafeLogMessage => 
      createSafeLogMessage('Tool config for "%s" is undefined. Skipping.'),
    noSymlinks: (): SafeLogMessage => 
      createSafeLogMessage('Tool "%s" has no symlinks defined, skipping.'),
    processingTool: (): SafeLogMessage => 
      createSafeLogMessage('Processing symlinks for tool "%s"'),
    processingSymlink: (): SafeLogMessage => 
      createSafeLogMessage('Processing symlink: source="%s" (abs: "%s"), target="%s" (abs: "%s")'),
    targetExists: (): SafeLogMessage => 
      createSafeLogMessage('Target path "%s" already exists.'),
    skipTargetExists: (): SafeLogMessage => 
      createSafeLogMessage('Target "%s" exists and overwrite is false. Skipping symlink creation.'),
    backupAttempt: (): SafeLogMessage => 
      createSafeLogMessage('Backup option enabled. Attempting to rename "%s" to "%s" using %s.'),
    backupSuccess: (): SafeLogMessage => 
      createSafeLogMessage('Successfully backed up "%s" to "%s" using %s.'),
    overwriteDelete: (): SafeLogMessage => 
      createSafeLogMessage('Overwrite enabled. Attempting to delete "%s" using %s.'),
    deleteSuccess: (): SafeLogMessage => 
      createSafeLogMessage('Successfully deleted "%s" for overwrite using %s.'),
    ensureDir: (): SafeLogMessage => 
      createSafeLogMessage('Ensuring target directory "%s" exists using %s.'),
    symlinkAttempt: (): SafeLogMessage => 
      createSafeLogMessage('Attempting to create symlink from "%s" to "%s" using %s.'),
    symlinkSuccess: (): SafeLogMessage => 
      createSafeLogMessage('Successfully created symlink from "%s" to "%s" using %s.'),
    generationComplete: (): SafeLogMessage => 
      createSafeLogMessage('Symlink generation process completed. Results: %o'),
  },
  githubClient: {
    constructorInit: (): SafeLogMessage => 
      createSafeLogMessage('GitHub API Client initialized. Base URL: %s, User-Agent: %s'),
    authToken: (): SafeLogMessage => 
      createSafeLogMessage('Using GitHub token for authentication.'),
    noAuthToken: (): SafeLogMessage => 
      createSafeLogMessage('No GitHub token provided; requests will be unauthenticated.'),
    cacheEnabled: (): SafeLogMessage => 
      createSafeLogMessage('Cache enabled with TTL of %d ms'),
    cacheDisabled: (): SafeLogMessage => 
      createSafeLogMessage('Cache available but disabled by configuration'),
    noCache: (): SafeLogMessage => 
      createSafeLogMessage('No cache provided; API responses will not be cached'),
    cacheKeyGenerated: (): SafeLogMessage => 
      createSafeLogMessage('Generated key for %s %s'),
    cacheHit: (): SafeLogMessage => 
      createSafeLogMessage('Cache hit for %s request to %s'),
    cacheMiss: (): SafeLogMessage => 
      createSafeLogMessage('Cache miss for %s request to %s'),
    cacheError: (): SafeLogMessage => 
      createSafeLogMessage('Error checking cache for %s request to %s: %s'),
    makingRequest: (): SafeLogMessage => 
      createSafeLogMessage('Making %s request to %s'),
    emptyResponse: (): SafeLogMessage => 
      createSafeLogMessage('Empty response buffer from downloader for URL: %s'),
    cachedResponse: (): SafeLogMessage => 
      createSafeLogMessage('Cached response for %s request to %s'),
    cacheStoreError: (): SafeLogMessage => 
      createSafeLogMessage('Error storing response in cache for %s request to %s: %s'),
    requestError: (): SafeLogMessage => 
      createSafeLogMessage('Request failed with error for %s: %o'),
    notFound: (): SafeLogMessage => 
      createSafeLogMessage('GitHub resource not found (404): %s. Body: %s'),
    rateLimitError: (): SafeLogMessage => 
      createSafeLogMessage('Rate limit exceeded for %s. Reset time: %s, Body: %s'),
    forbidden: (): SafeLogMessage => 
      createSafeLogMessage('GitHub API access forbidden (403): %s. Body: %s'),
    clientError: (): SafeLogMessage => 
      createSafeLogMessage('Client error (4xx) for %s. Status: %d, Body: %s'),
    serverError: (): SafeLogMessage => 
      createSafeLogMessage('Server error (5xx) for %s. Status: %d, Body: %s'),
    networkError: (): SafeLogMessage => 
      createSafeLogMessage('Network error for %s: %s'),
    unknownError: (): SafeLogMessage => 
      createSafeLogMessage('Unknown error for %s: %o'),
    fetchingLatestRelease: (): SafeLogMessage => 
      createSafeLogMessage('Fetching latest release for %s/%s'),
    latestReleaseNotFound: (): SafeLogMessage => 
      createSafeLogMessage('Resource not found for %s/%s. Returning null.'),
    latestReleaseError: (): SafeLogMessage => 
      createSafeLogMessage('Error fetching latest release for %s/%s: %s'),
    fetchingReleaseByTag: (): SafeLogMessage => 
      createSafeLogMessage('Fetching release by tag %s for %s/%s'),
    releaseByTagNotFound: (): SafeLogMessage => 
      createSafeLogMessage('Release with tag "%s" not found for %s/%s. Returning null.'),
    releaseByTagError: (): SafeLogMessage => 
      createSafeLogMessage('Error fetching release by tag %s for %s/%s: %s'),
    fetchingAllReleases: (): SafeLogMessage => 
      createSafeLogMessage('Fetching all releases for %s/%s with options: %o'),
    fetchingPage: (): SafeLogMessage => 
      createSafeLogMessage('Fetching page %d from %s'),
    totalReleasesFetched: (): SafeLogMessage => 
      createSafeLogMessage('Fetched %d releases in total for %s/%s'),
    constraintSearch: (): SafeLogMessage => 
      createSafeLogMessage('Searching for release matching constraint "%s" for %s/%s'),
    constraintVersions: (): SafeLogMessage => 
      createSafeLogMessage('Available versions for constraint matching: %s'),
    constraintPageFetch: (): SafeLogMessage => 
      createSafeLogMessage('Iterating pages to find match for constraint "%s"'),
    constraintFetchingPage: (): SafeLogMessage => 
      createSafeLogMessage('Fetching page %d for %s/%s'),
    constraintError: (): SafeLogMessage => 
      createSafeLogMessage('Error fetching releases for constraint "%s" on %s/%s: %s'),
    constraintCandidate: (): SafeLogMessage => 
      createSafeLogMessage('Checking release candidate: %s (published %s)'),
    constraintPageLimit: (): SafeLogMessage => 
      createSafeLogMessage('Reached page limit (100), stopping search.'),
    constraintResult: (): SafeLogMessage => 
      createSafeLogMessage('Found matching release for constraint "%s": %s (published %s)'),
    constraintNotFound: (): SafeLogMessage => 
      createSafeLogMessage('No release found for constraint "%s"'),
    fetchingRateLimit: (): SafeLogMessage => 
      createSafeLogMessage('Fetching rate limit status.'),
    filteredPrereleases: (): SafeLogMessage => 
      createSafeLogMessage('Filtered out prereleases, %d releases remaining.'),
    constraintLatestError: (): SafeLogMessage => 
      createSafeLogMessage('Error fetching latest release for constraint "latest": %s'),
    constraintBestCandidate: (): SafeLogMessage => 
      createSafeLogMessage('New best candidate found: %s (version %s)'),
    constraintFinalResult: (): SafeLogMessage => 
      createSafeLogMessage('Final best release for constraint "%s" is %s'),
  },
  versionChecker: {
    constructorInit: (): SafeLogMessage => 
      createSafeLogMessage('Initializing VersionChecker with githubClient'),
    fetchingLatest: (): SafeLogMessage => 
      createSafeLogMessage('Fetching latest version for repository'),
    latestReleaseFound: (): SafeLogMessage => 
      createSafeLogMessage('Latest release found: %s'),
    latestReleaseError: (): SafeLogMessage => 
      createSafeLogMessage('Error fetching latest release for %s/%s: %s'),
    noLatestRelease: (): SafeLogMessage => 
      createSafeLogMessage('No latest release found for %s/%s'),
    comparingVersions: (): SafeLogMessage => 
      createSafeLogMessage('Comparing versions: configured=%s, latest=%s'),
    versionComparisonResult: (): SafeLogMessage => 
      createSafeLogMessage('Version comparison result: %s'),
    invalidConfiguredVersion: (): SafeLogMessage => 
      createSafeLogMessage('Invalid configured version: %s'),
    invalidLatestVersion: (): SafeLogMessage => 
      createSafeLogMessage('Invalid latest version: %s'),
    comparisonError: (): SafeLogMessage => 
      createSafeLogMessage('Error during version comparison: %s'),
  },
  hookExecutor: {
    executingHook: (): SafeLogMessage => 
      createSafeLogMessage('Executing %s hook with %dms timeout'),
    hookCompleted: (): SafeLogMessage => 
      createSafeLogMessage('Hook %s completed successfully in %dms'),
    continuingDespiteFailure: (): SafeLogMessage => 
      createSafeLogMessage('Continuing installation despite %s hook failure'),
    stoppingDueToFailure: (): SafeLogMessage => 
      createSafeLogMessage('Stopping hook execution due to failure in %s hook'),
  },
  installer: {
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
  },
} as const;

/**
 * Warning message templates for consistent logging
 */
export const WarningTemplates = {
  tool: {
    alreadyInstalled: (toolName: string, version: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" version ${version} is already installed`),
    outdatedVersion: (toolName: string, current: string, latest: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" version ${current} is outdated (latest: ${latest})`),
    unusedTool: (toolName: string, lastUsed: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" hasn't been used since ${lastUsed}`),
    versionComparisonFailed: (toolName: string, current: string, latest: string): SafeLogMessage => 
      createSafeLogMessage(`Could not determine update status for ${toolName} (${current}) against latest ${latest}`),
    conflictsDetected: (header: string, conflicts: string): SafeLogMessage => 
      createSafeLogMessage(`${header}\n${conflicts}`),
  },
  config: {
    deprecated: (field: string, replacement: string): SafeLogMessage => 
      createSafeLogMessage(`Configuration field "${field}" is deprecated. Use "${replacement}" instead`),
    ignored: (field: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Configuration field "${field}" ignored: ${reason}`),
    defaultUsed: (field: string, defaultValue: string): SafeLogMessage => 
      createSafeLogMessage(`Using default value for ${field}: ${defaultValue}`),
    overridden: (field: string, value: string): SafeLogMessage => 
      createSafeLogMessage(`${field.charAt(0).toUpperCase() + field.slice(1)} overridden to: ${value}`),
    invalid: (field: string, value: string, expected: string): SafeLogMessage => 
      createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
  },
  fs: {
    overwriting: (toolName: string, path: string): SafeLogMessage => 
      createSafeLogMessage(`[${toolName}] Overwrote: ${path}`),
    permissionsFixed: (path: string, newPermissions: string): SafeLogMessage => 
      createSafeLogMessage(`Fixed permissions on ${path} to ${newPermissions}`),
    readFailed: (path: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Failed to read ${path}: ${reason}`),
    notFound: (itemType: string, path: string): SafeLogMessage => 
      createSafeLogMessage(`${itemType} not found: ${path}`),
  },
  service: {
    github: {
      notFound: (resource: string, identifier: string): SafeLogMessage => 
        createSafeLogMessage(`GitHub ${resource} not found: ${identifier}`),
    },
  },
  general: {
    unsupportedOperation: (operation: string, details: string): SafeLogMessage => 
      createSafeLogMessage(`${operation} not yet supported (${details})`),
  },
} as const;

/**
 * Success message templates for consistent positive feedback
 */
export const SuccessTemplates = {
  tool: {
    installed: (toolName: string, version: string, method: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" v${version} installed successfully using ${method}`),
    updated: (toolName: string, fromVersion: string, toVersion: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" updated from v${fromVersion} to v${toVersion}`),
    removed: (toolName: string): SafeLogMessage => 
      createSafeLogMessage(`Tool "${toolName}" removed successfully`),
    processing: (toolName: string, operation: string): SafeLogMessage => createSafeLogMessage(`Processing ${toolName} (${operation})`),
    processingComplete: (toolName: string, operation: string, duration?: number): SafeLogMessage => 
      createSafeLogMessage(`Completed ${toolName} (${operation})${duration ? ` in ${duration}ms` : ''}`),
  },
  config: {
    loaded: (configPath: string, toolCount: number): SafeLogMessage => 
      createSafeLogMessage(`Configuration loaded from ${configPath} (${toolCount} tools configured)`),
    validated: (configPath: string): SafeLogMessage => 
      createSafeLogMessage(`Configuration validated successfully: ${configPath}`),
    platformOverrides: (platform: string, arch: string): SafeLogMessage => 
      createSafeLogMessage(`platform overrides: ${platform} ${arch}`),
    configProcessing: (): SafeLogMessage => createSafeLogMessage('config processing'),
    toolConfigLoading: (toolConfigsDir: string): SafeLogMessage => createSafeLogMessage(`tool config loading: ${toolConfigsDir}`),
    directoryScan: (toolConfigsDir: string): SafeLogMessage => createSafeLogMessage(`directory scan: ${toolConfigsDir}`),
    toolConfigLoad: (filePath: string): SafeLogMessage => createSafeLogMessage(`tool config load: ${filePath}`),
    singleToolConfigLoad: (toolName: string, toolConfigsDir: string): SafeLogMessage => createSafeLogMessage(`single tool config load: ${toolName} in ${toolConfigsDir}`),
  },
  operation: {
    completed: (operation: string, duration: number, itemCount?: number): SafeLogMessage => 
      createSafeLogMessage(`${operation} completed in ${duration}ms${itemCount ? ` (${itemCount} items)` : ''}`),
  },
  fs: {
    created: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Created: ${path}`),
    updated: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Updated: ${path}`),
    removed: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Deleted: ${path}`),
    moved: (toolName: string, oldPath: string, newPath: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Moved: ${oldPath} → ${newPath}`),
    copied: (toolName: string, srcPath: string, destPath: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Copied: ${srcPath} → ${destPath}`),
    symlinkCreated: (toolName: string, linkPath: string, targetPath: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Symlink: ${linkPath} → ${targetPath}`),
    permissionsChanged: (toolName: string, path: string, mode: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] Permissions: ${path} (${mode})`),
  },
  architecture: {
    patterns: (): SafeLogMessage => createSafeLogMessage('architecture patterns'),
    regexCreation: (): SafeLogMessage => createSafeLogMessage('regex creation'),
    assetMatchCheck: (assetName: string): SafeLogMessage => createSafeLogMessage(`asset match check: ${assetName}`),
  },
  downloader: {
    downloadFrom: (strategyName: string): SafeLogMessage => createSafeLogMessage(`download from ${strategyName}`),
    readFileForCaching: (path: string): SafeLogMessage => createSafeLogMessage(`read file for caching: ${path}`),
  },
  cache: {
    hit: (key: string, strategy: string, size?: number): SafeLogMessage => {
      const sizeStr = size !== undefined ? `, size: ${size} bytes` : '';
      return createSafeLogMessage(`Cache hit for key: ${key} (${strategy})${sizeStr}`);
    },
    stored: (key: string, strategy: string, expiresAt: string, size?: number): SafeLogMessage => {
      const sizeStr = size !== undefined ? `, size: ${size} bytes` : '';
      return createSafeLogMessage(`Cached data for key: ${key} (${strategy})${sizeStr}, expires: ${expiresAt}`);
    },
    removed: (key: string): SafeLogMessage => 
      createSafeLogMessage(`Removed cache entry for key: ${key}`),
    cleared: (): SafeLogMessage => 
      createSafeLogMessage('Removed entire cache directory'),
    expiredCleared: (count: number): SafeLogMessage => 
      createSafeLogMessage(`Removed ${count} expired cache entries`),
    entryExists: (key: string): SafeLogMessage => 
      createSafeLogMessage(`Valid cache entry exists for key: ${key}`),
  },
  registry: {
    initialized: (path: string): SafeLogMessage => createSafeLogMessage(`File tracking initialized: ${path}`),
    operationsTracked: (count: number, toolName: string): SafeLogMessage => createSafeLogMessage(`Tracked ${count} file operations for ${toolName}`),
    summaryStats: (totalFiles: number, totalTools: number): SafeLogMessage => createSafeLogMessage(`Registry contains ${totalFiles} files across ${totalTools} tools`),
  },
  general: {
    started: (operation: string): SafeLogMessage => createSafeLogMessage(`${operation} started`),
    completed: (operation: string): SafeLogMessage => createSafeLogMessage(`${operation} completed`),
    initialized: (component: string): SafeLogMessage => createSafeLogMessage(`${component} initialized`),
    // General configuration and loading messages
    toolConfigsForDryRun: (): SafeLogMessage => createSafeLogMessage('tool configs for dry run'),
    generatedShimsByTool: (): SafeLogMessage => createSafeLogMessage('Generated shims by tool'),
    // CLI-specific messages
    cliStarted: (): SafeLogMessage => createSafeLogMessage('CLI starting with arguments'),
    dryRunEnabled: (): SafeLogMessage => createSafeLogMessage('Dry run enabled. Initializing MemFileSystem'),
    servicesSetup: (): SafeLogMessage => createSafeLogMessage('Services setup complete'),
    cachingEnabled: (): SafeLogMessage => createSafeLogMessage('Caching enabled'),
    cachingDisabled: (): SafeLogMessage => createSafeLogMessage('Caching disabled'),
    // Conflict detection messages
    noConflictsDetected: (): SafeLogMessage => createSafeLogMessage('No conflicts detected'),
    // Update checking messages
    checkingUpdates: (toolName: string): SafeLogMessage => createSafeLogMessage(`updates for ${toolName}`),
    checkingUpdatesFor: (toolName: string): SafeLogMessage => createSafeLogMessage(`updates check for "${toolName}"`),
    processingUpdate: (toolName: string, fromVersion: string, toVersion: string): SafeLogMessage => createSafeLogMessage(`${toolName} update from ${fromVersion} to ${toVersion}`),
    noToolsFound: (toolConfigDir: string): SafeLogMessage => createSafeLogMessage(`No tool configurations found in ${toolConfigDir}`),
    toolOnLatest: (toolName: string, version: string): SafeLogMessage => createSafeLogMessage(`Tool "${toolName}" is configured to 'latest'. The latest available version is ${version}`),
    updateAvailable: (toolName: string, current: string, latest: string): SafeLogMessage => createSafeLogMessage(`Update available for ${toolName}: ${current} -> ${latest}`),
    toolUpToDate: (toolName: string, current: string, latest: string): SafeLogMessage => createSafeLogMessage(`${toolName} (${current}) is up to date. Latest: ${latest}`),
    toolAhead: (toolName: string, current: string, latest: string): SafeLogMessage => createSafeLogMessage(`${toolName} (${current}) is ahead of the latest known version (${latest})`),
    // Cleanup command messages  
    cleanupAllTrackedFiles: (): SafeLogMessage => createSafeLogMessage('Registry-based cleanup: Removing all tracked files'),
    cleanupRegistryDatabase: (): SafeLogMessage => createSafeLogMessage('registry database cleanup'),
    cleanupToolFiles: (tool: string): SafeLogMessage => createSafeLogMessage(`Registry-based cleanup: files for tool '${tool}'`),
    cleanupTypeFiles: (type: string): SafeLogMessage => createSafeLogMessage(`Registry-based cleanup: files of type '${type}'`),
    cleanupShimDeletion: (): SafeLogMessage => createSafeLogMessage('shim deletion'),
    cleanupShellInitDeletion: (): SafeLogMessage => createSafeLogMessage('shell init file deletion'),
    cleanupSymlinkDeletion: (): SafeLogMessage => createSafeLogMessage('symlink deletion'),
    cleanupRegistryDryRun: (): SafeLogMessage => createSafeLogMessage('Would clean up registry database (dry run)'),
    // Files command messages
    checkingFileStates: (): SafeLogMessage => createSafeLogMessage('Checking file states for all tools'),
    fileStatesForTool: (toolName: string): SafeLogMessage => createSafeLogMessage(`${toolName} files`),
    noFileOperationsFound: (): SafeLogMessage => createSafeLogMessage('No file operations found matching criteria'),
    listingFileOperations: (): SafeLogMessage => createSafeLogMessage('Listing file operations by tool'),
    operationInfo: (operationType: string, filePath: string): SafeLogMessage => createSafeLogMessage(`${operationType}: ${filePath}`),
    operationDetails: (fileType: string, timestamp: string, sizeText: string): SafeLogMessage => createSafeLogMessage(`Type: ${fileType} | Time: ${timestamp}${sizeText}`),
    operationTarget: (targetPath: string): SafeLogMessage => createSafeLogMessage(`Target: ${targetPath}`),
    operationMetadata: (metadata: string): SafeLogMessage => createSafeLogMessage(`Metadata: ${metadata}`),
    toolOperations: (toolName: string, count: number): SafeLogMessage => createSafeLogMessage(`${toolName} (${count} operations):`),
    fileReport: (): SafeLogMessage => createSafeLogMessage('File Status Report'),
    fileReportSeparator: (): SafeLogMessage => createSafeLogMessage('=================='),
    operationsReport: (count: number): SafeLogMessage => createSafeLogMessage(`Found ${count} tracked file operations`),
    operationsReportSeparator: (): SafeLogMessage => createSafeLogMessage('============================================'),
    fileStatus: (statusIcon: string, filePath: string, fileType: string, statusText: string, sizeText: string): SafeLogMessage => 
      createSafeLogMessage(`${statusIcon} ${filePath} [${fileType}] - ${statusText}${sizeText}`),
    targetStatus: (targetIcon: string, targetPath: string): SafeLogMessage => 
      createSafeLogMessage(`${targetIcon} ${targetPath}`),
    symlinkOperation: (targetPath: string, sourcePath: string, status: string, error?: string): SafeLogMessage => {
      let message = `Target: ${targetPath} <- Source: ${sourcePath} (Status: ${status})`;
      if (status === 'failed' && error) {
        message += ` | Error: ${error}`;
      } else if (status === 'skipped_exists') {
        message += ` (target already exists)`;
      } else if (status === 'skipped_source_missing') {
        message += ` (source file missing)`;
      }
      return createSafeLogMessage(message);
    },
    cleanupRegistryTool: (tool: string, dryRun: boolean): SafeLogMessage => 
      createSafeLogMessage(dryRun ? `Would remove registry entries for tool: ${tool} (dry run)` : `Removed registry entries for tool: ${tool}`),
    fileCleanupDryRun: (filePath: string): SafeLogMessage => createSafeLogMessage(`Would delete: ${filePath}`),
    directoryCleanupInfo: (dirPath: string, exists: boolean, dryRun: boolean): SafeLogMessage => {
      if (!exists) return createSafeLogMessage(`Generated directory not found, skipping: ${dirPath}`);
      if (dryRun) return createSafeLogMessage(`Would delete generated directory: ${dirPath}`);
      return createSafeLogMessage(`deleted generated directory ${dirPath}`);
    },
  },
} as const;

