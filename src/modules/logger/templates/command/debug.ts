import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const commandDebugTemplates = {
  actionStarted: (commandName: string, targetTool?: string) =>
    createSafeLogMessage(`${commandName} command action logic started${targetTool ? `. Tool: ${targetTool}` : ''}`),
  versionComparisonDebug: (toolName: string, configured: string, latest: string) =>
    createSafeLogMessage(`Tool: ${toolName}, Configured: ${configured}, Latest: ${latest}`),
  githubApiError: (toolName: string) => createSafeLogMessage(`GitHub API error details for ${toolName}: %O`),
  unsupportedMethod: (toolName: string, method: string) =>
    createSafeLogMessage(`Update checking not yet supported for ${toolName} (method: ${method})`),
  actionCalled: (commandName: string, targetTool?: string) =>
    createSafeLogMessage(`Action called for ${commandName}${targetTool ? ` "${targetTool}"` : ''} with options: %O`),
  unhandledError: () => createSafeLogMessage('Unhandled error in action handler: %O'),
  errorDetails: () => createSafeLogMessage('Error details: %O'),
  configErrorDetails: () => createSafeLogMessage('Configuration loading error details: %O'),
  // Cleanup command specific templates
  cleanupStarted: (dryRun: boolean) => createSafeLogMessage(`starting cleanup process, dryRun=${dryRun}: %O`),
  cleanupFinished: (dryRun: boolean) => createSafeLogMessage(`cleanup process finished, dryRun=${dryRun}`),
  manifestRead: () => createSafeLogMessage('manifest file read and parsed successfully'),
  manifestMissing: () => createSafeLogMessage('manifest file does not exist'),
  manifestError: () => createSafeLogMessage('error reading or parsing manifest file: %s'),
  fileDeletion: (filePath: string, success: boolean, dryRun: boolean) => {
    if (dryRun) return createSafeLogMessage(`would delete ${filePath} (dry run)`);
    if (success) return createSafeLogMessage(`deleted ${filePath}`);
    return createSafeLogMessage(`error deleting ${filePath}: %s`);
  },
  fileNotFound: (filePath: string) => createSafeLogMessage(`file not found ${filePath}`),
  foundFiles: (count: number, toolName: string, fileType?: string) =>
    createSafeLogMessage(`Found ${count} files for tool '${toolName}'${fileType ? ` of type '${fileType}'` : ''}`),
  shimDeletion: (shimPath: string, success: boolean, dryRun: boolean) => {
    if (dryRun) return createSafeLogMessage(`would delete shim ${shimPath} (dry run)`);
    if (success) return createSafeLogMessage(`deleted shim ${shimPath}`);
    return createSafeLogMessage(`error deleting shim ${shimPath}: %s`);
  },
  shellInitDeletion: (initPath: string, success: boolean, dryRun: boolean) => {
    if (dryRun) return createSafeLogMessage(`would delete shell init ${initPath} (dry run)`);
    if (success) return createSafeLogMessage(`deleted shell init ${initPath}`);
    return createSafeLogMessage(`error deleting shell init ${initPath}: %s`);
  },
  symlinkDeletion: (symlinkPath: string, success: boolean, dryRun: boolean) => {
    if (dryRun) return createSafeLogMessage(`would delete symlink ${symlinkPath} (dry run)`);
    if (success) return createSafeLogMessage(`deleted symlink ${symlinkPath}`);
    return createSafeLogMessage(`error deleting symlink ${symlinkPath}: %s`);
  },
  shimNotFound: (shimPath: string) => createSafeLogMessage(`shim not found ${shimPath}`),
  shellInitNotFound: (initPath: string) => createSafeLogMessage(`shell init file not found ${initPath}`),
  symlinkNotFound: (symlinkPath: string) => createSafeLogMessage(`symlink target not found ${symlinkPath}`),
  // Installer-specific debug messages
  installerConstructor: () =>
    createSafeLogMessage(
      'constructor: fileSystem=%s, downloader=%s, githubApiClient=%s, archiveExtractor=%s, appConfig=%o'
    ),
  installDebug: (operation: string) => createSafeLogMessage(`install: ${operation}`),
  installMethodDebug: (method: string, operation: string) => createSafeLogMessage(`${method}: ${operation}`),
  hookExecution: (hookName: string) => createSafeLogMessage(`install: Running ${hookName} hook`),
  directoryCreated: () => createSafeLogMessage(`install: Created installation directory: %s`),
  methodStarted: () => createSafeLogMessage('Starting with toolName=%s'),
  methodDebugParams: () => createSafeLogMessage('toolName=%s, toolConfig=%o, options=%o'),
  gitHubReleaseLatest: () => createSafeLogMessage('Getting latest release for %s'),
  gitHubReleaseDetails: () => createSafeLogMessage('Latest release for %s is %s (published %s)'),
  assetSelectorCustom: () => createSafeLogMessage('Using custom asset selector'),
  assetSelectorFound: () => createSafeLogMessage('Selected asset: %s'),
  downloadStarted: () => createSafeLogMessage('Downloading %s from %s'),
  assetPatternMatch: () => createSafeLogMessage('Finding asset matching pattern: %s'),
  assetPlatformMatch: () => createSafeLogMessage('Finding asset for platform %s and architecture %s'),
  // Specific structured debug messages for installer operations
  determiningDownloadUrl: () =>
    createSafeLogMessage('Determining download URL. rawBrowserDownloadUrl="%s", customHost="%s"'),
  usingAbsoluteUrl: () => createSafeLogMessage('Using absolute browser_download_url directly: "%s"'),
  resolvedRelativeUrl: () =>
    createSafeLogMessage('Resolved relative URL. Base: "%s", Relative Path: "%s", Result: "%s"'),
  invalidUrlFormat: () => createSafeLogMessage('Invalid or unsupported browser_download_url format: "%s"'),
  finalDownloadUrl: () =>
    createSafeLogMessage('Final download URL determined. Raw: "%s", Configured Host: "%s", Result: "%s"'),
  downloadUrlError: () =>
    createSafeLogMessage('Download URL construction error details: Raw: "%s", Configured Host: "%s", Error: %s'),
  downloadingAsset: () => createSafeLogMessage('Downloading asset: %s'),
  platformInfo: () => createSafeLogMessage('Platform: %s, Architecture: %s'),
  assetFound: () => createSafeLogMessage('Found matching asset: %s'),
  downloadProgress: () => createSafeLogMessage('Downloading %s to %s'),
} satisfies SafeLogMessageMap;
