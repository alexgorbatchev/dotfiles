import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  binarySetupStep: {
    starting: (toolName: string, setupType: 'archive' | 'direct') =>
      createSafeLogMessage(`Setting up binaries for ${toolName} (${setupType})`),
  } satisfies SafeLogMessageMap,
  binarySetupService: {
    binaryNotFound: (binaryName: string, pattern: string) =>
      createSafeLogMessage(`Binary ${binaryName} not found at ${pattern}, skipping`),
    extractedFilesTree: (extractDir: string, treeLines: string) =>
      createSafeLogMessage(`Extracted files in ${extractDir}:\n${treeLines}`),
    cleaningFailedInstall: (extractDir: string) =>
      createSafeLogMessage(`No binaries found, cleaning up installation directory: ${extractDir}`),
    searchingWithPattern: (pattern: string, directoryPath: string) =>
      createSafeLogMessage(`Searching for binary using pattern ${pattern} in directory ${directoryPath}`),
    fallbackPattern: (pattern: string, directoryPath: string) =>
      createSafeLogMessage(`Trying fallback binary pattern ${pattern} in directory ${directoryPath}`),
    patternPathMissing: (missingPath: string) => createSafeLogMessage(`Pattern path does not exist: ${missingPath}`),
    noPatternMatch: (patternSegment: string, directoryPath: string) =>
      createSafeLogMessage(`No matches found for pattern ${patternSegment} in directory ${directoryPath}`),
    directDownloadSingleBinary: (configuredCount: number, primaryBinary: string) =>
      createSafeLogMessage(
        `Direct download only provides one binary, but ${configuredCount} were configured. Only ${primaryBinary} will be available.`
      ),
  } satisfies SafeLogMessageMap,
  binarySymlink: {
    targetBinaryMissing: (toolName: string, binaryName: string, targetPath: string) =>
      createSafeLogMessage(
        `Cannot create symlink for ${toolName}/${binaryName}: target binary missing at ${targetPath}`
      ),
    removingExisting: (symlinkPath: string) => createSafeLogMessage(`Removing old symlink: ${symlinkPath}`),
    removeExistingFailed: (symlinkPath: string) => createSafeLogMessage(`Failed to remove old symlink ${symlinkPath}`),
    creating: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Creating symlink: ${symlinkPath} -> ${targetPath}`),
    creationFailed: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Failed to create symlink ${symlinkPath} -> ${targetPath}`),
    verificationMismatch: (symlinkPath: string, expectedTarget: string, actualTarget: string) =>
      createSafeLogMessage(`Symlink ${symlinkPath} points to ${actualTarget}, expected ${expectedTarget}`),
    verificationFailed: (symlinkPath: string) => createSafeLogMessage(`Failed to verify symlink ${symlinkPath}`),
    createdAndVerified: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Successfully created and verified symlink: ${symlinkPath} -> ${targetPath}`),
  } satisfies SafeLogMessageMap,
  lifecycle: {
    methodStarted: (toolName: string) => createSafeLogMessage(`Starting installation for ${toolName}`),
    methodParams: (toolName: string) =>
      createSafeLogMessage(`toolName=${toolName}; tool configuration and options attached`),
    hookExecution: (hookName: string) => createSafeLogMessage(`install: Running ${hookName} hook`),
    directoryCreated: (installDir: string) =>
      createSafeLogMessage(`install: Created installation directory: ${installDir}`),
  } satisfies SafeLogMessageMap,
  outcome: {
    installSuccess: (toolName: string, version: string, method: string) =>
      createSafeLogMessage(`Tool "${toolName}" v${version} installed successfully using ${method}`),
    outdatedVersion: (toolName: string, currentVersion: string, latestVersion: string) =>
      createSafeLogMessage(`Tool "${toolName}" version ${currentVersion} is outdated (latest: ${latestVersion})`),
    installFailed: (method: string, toolName: string) =>
      createSafeLogMessage(`Installation failed [${method}] for tool "${toolName}"`),
    unsupportedOperation: (operation: string, details: string) =>
      createSafeLogMessage(`${operation} not yet supported (${details})`),
  } satisfies SafeLogMessageMap,
  gitHubRelease: {
    fetchLatest: (repo: string) => createSafeLogMessage(`Getting latest release for ${repo}`),
    fetchByTag: (version: string, repo: string) => createSafeLogMessage(`Fetching release ${version} for ${repo}`),
    assetSelectorCustom: () => createSafeLogMessage('Using custom asset selector'),
    assetPatternMatch: (pattern: string) => createSafeLogMessage(`Finding asset matching pattern: ${pattern}`),
    assetPlatformMatch: (platform: string, arch: string) =>
      createSafeLogMessage(`Selecting asset for platform ${platform} and architecture ${arch}`),
    determiningDownloadUrl: (rawUrl: string, customHost: string | undefined) =>
      createSafeLogMessage(
        `Determining download URL. rawBrowserDownloadUrl="${rawUrl}", customHost="${customHost ?? '(public GitHub)'}"`
      ),
    usingAbsoluteUrl: (url: string) => createSafeLogMessage(`Using absolute browser_download_url directly: "${url}"`),
    invalidRelativeUrl: (rawUrl: string) => createSafeLogMessage(`Invalid asset download URL format: ${rawUrl}`),
    resolvedRelativeUrl: (base: string, rawUrl: string, resolved: string) =>
      createSafeLogMessage(`Resolved relative URL. Base: "${base}", Relative Path: "${rawUrl}", Result: "${resolved}"`),
    finalDownloadUrl: (rawUrl: string, host: string, resolved: string) =>
      createSafeLogMessage(
        `Final download URL determined. Raw: "${rawUrl}", Configured Host: "${host}", Result: "${resolved}"`
      ),
    downloadUrlError: (rawUrl: string, host: string) =>
      createSafeLogMessage(`Download URL construction failed: Raw: "${rawUrl}", Configured Host: "${host}"`),
    downloadingAsset: (downloadUrl: string) => createSafeLogMessage(`Downloading asset: ${downloadUrl}`),
    extractingArchive: (assetName: string) => createSafeLogMessage(`Extracting archive: ${assetName}`),
    archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
    cleaningArchive: (downloadPath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${downloadPath}`),
    invalidUrl: (url: string) => createSafeLogMessage(`Invalid URL: ${url}`),
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
  curlScript: {
    installing: (toolName: string) => createSafeLogMessage(`installFromCurlScript: toolName=${toolName}`),
    downloadingScript: (url: string) => createSafeLogMessage(`installFromCurlScript: Downloading script from ${url}`),
    executingScript: (shell: string) => createSafeLogMessage(`installFromCurlScript: Executing script with ${shell}`),
  } satisfies SafeLogMessageMap,
  curlTar: {
    installing: (toolName: string) => createSafeLogMessage(`installFromCurlTar: toolName=${toolName}`),
    downloadingTarball: (url: string) => createSafeLogMessage(`installFromCurlTar: Downloading tarball from ${url}`),
    extractingTarball: () => createSafeLogMessage('installFromCurlTar: Extracting tarball'),
    tarballExtracted: () => createSafeLogMessage('installFromCurlTar: Tarball extracted: %o'),
    cleaningArchive: (tarballPath: string) =>
      createSafeLogMessage(`installFromCurlTar: Cleaning up downloaded archive: ${tarballPath}`),
  } satisfies SafeLogMessageMap,
  cargo: {
    installing: (toolName: string) => createSafeLogMessage(`Installing from cargo: toolName=${toolName}`),
    foundVersion: (crateName: string, version: string) =>
      createSafeLogMessage(`Found crate ${crateName} version ${version}`),
    downloadingAsset: (assetName: string, url: string) =>
      createSafeLogMessage(`Downloading asset ${assetName} from ${url}`),
    archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
    cleaningArchive: (archivePath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${archivePath}`),
    parsingMetadata: (cargoTomlUrl: string) => createSafeLogMessage(`Parsing crate metadata from: ${cargoTomlUrl}`),
    queryingCratesIo: (crateName: string) => createSafeLogMessage(`Querying crates.io API for crate: ${crateName}`),
    queryingGitHubReleases: (repo: string) => createSafeLogMessage(`Querying GitHub releases for ${repo}`),
  } satisfies SafeLogMessageMap,
  brew: {
    installing: (toolName: string) => createSafeLogMessage(`Installing from brew: toolName=${toolName}`),
    executingCommand: (command: string) => createSafeLogMessage(`installFromBrew: Executing command: ${command}`),
    fetchingVersion: (formula: string) => createSafeLogMessage(`Fetching version info for formula: ${formula}`),
    versionFetched: (formula: string, version: string) =>
      createSafeLogMessage(`Fetched version ${version} for formula ${formula}`),
    versionNotFound: (formula: string) => createSafeLogMessage(`No stable version found for formula ${formula}`),
    versionFetchFailed: (formula: string) => createSafeLogMessage(`Failed to fetch version for formula ${formula}`),
  } satisfies SafeLogMessageMap,
  manual: {
    installing: (toolName: string) => createSafeLogMessage(`installManually: toolName=${toolName}`),
    multipleBinariesNotSupported: (binaryName: string) =>
      createSafeLogMessage(`Manual installation with multiple binaries not fully supported for ${binaryName}`),
  } satisfies SafeLogMessageMap,
  pipeline: {
    starting: (toolName: string, stepCount: number) =>
      createSafeLogMessage(`Starting installation pipeline for ${toolName} with ${stepCount} steps`),
    executingStep: (currentStep: number, totalSteps: number, stepName: string) =>
      createSafeLogMessage(`Executing step ${currentStep}/${totalSteps}: ${stepName}`),
    stepFailed: (stepName: string, reason: string | undefined) =>
      createSafeLogMessage(`Step ${stepName} failed: ${reason ?? 'unknown reason'}`),
    stepCompleted: (stepName: string) => createSafeLogMessage(`Step ${stepName} completed successfully`),
    completed: (toolName: string) =>
      createSafeLogMessage(`Installation pipeline completed successfully for ${toolName}`),
  } satisfies SafeLogMessageMap,
  downloadStep: {
    downloadingAsset: (filename: string, url: string) =>
      createSafeLogMessage(`Downloading asset ${filename} from ${url}`),
  } satisfies SafeLogMessageMap,
  extractStep: {
    extractingArchive: (downloadPath: string) => createSafeLogMessage(`Extracting archive: ${downloadPath}`),
    archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
  } satisfies SafeLogMessageMap,
  hookStep: {
    executingHook: (hookType: string) => createSafeLogMessage(`Executing ${hookType} hook`),
  } satisfies SafeLogMessageMap,
  completion: {
    noCompletionsConfigured: () => createSafeLogMessage('install: no completions configured'),
    generatingCompletions: (count: number) => createSafeLogMessage(`install: generating ${count} completion files`),
    generatedCompletion: (filename: string, targetPath: string) =>
      createSafeLogMessage(`install: generated completion: ${filename} -> ${targetPath}`),
  } satisfies SafeLogMessageMap,
  hooks: {
    afterDownload: () => createSafeLogMessage('Running afterDownload hook'),
    afterExtract: () => createSafeLogMessage('Running afterExtract hook'),
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
