import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const commandDebugTemplates = {
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
} as const;