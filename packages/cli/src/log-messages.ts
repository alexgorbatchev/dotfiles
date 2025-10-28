import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  commandActionCalled: (commandName: string, targetTool?: string) =>
    createSafeLogMessage(`Action called for ${commandName}${targetTool ? ` "${targetTool}"` : ''}`),
  commandActionStarted: (commandName: string, targetTool?: string) =>
    createSafeLogMessage(`${commandName} command action logic started${targetTool ? `. Tool: ${targetTool}` : ''}`),
  commandConfigErrorDetails: () => createSafeLogMessage('Configuration loading error details: %O'),
  dryRunEnabled: () => createSafeLogMessage('Dry run enabled. Initializing MemFileSystem'),
  componentInitialized: (component: string) => createSafeLogMessage(`${component} initialized`),
  toolConfigsLoading: (toolConfigsDir: string) => createSafeLogMessage(`tool config loading: ${toolConfigsDir}`),
  toolConfigsLoaded: (toolConfigsDir: string, toolCount: number) =>
    createSafeLogMessage(`Configuration loaded from ${toolConfigsDir} (${toolCount} tools configured)`),
  toolConfigsForDryRun: () => createSafeLogMessage('tool configs for dry run'),
  commandCompleted: (isDryRun: boolean) => createSafeLogMessage(`DONE${isDryRun ? ' (dry run)' : ''}`),
  commandExecutionFailed: (commandName: string, exitCode: number) =>
    createSafeLogMessage(`Command failed [${commandName}] exit ${exitCode}`),
  commandVersionComparison: (toolName: string, configuredVersion: string, latestVersion: string) =>
    createSafeLogMessage(`Tool: ${toolName}, Configured: ${configuredVersion}, Latest: ${latestVersion}`),
  commandUnsupportedOperation: (operation: string, details: string) =>
    createSafeLogMessage(`${operation} not yet supported (${details})`),
  toolNotFound: (toolName: string, source: string) => createSafeLogMessage(`Tool "${toolName}" not found in ${source}`),
  toolInstalled: (toolName: string, version: string, method: string) =>
    createSafeLogMessage(`Tool "${toolName}" v${version} installed successfully using ${method}`),
  toolInstallFailed: (method: string, toolName: string, reason: string) =>
    createSafeLogMessage(`Installation failed [${method}] for tool "${toolName}": ${reason}`),
  toolNoConfigurationsFound: (toolConfigsDir: string) =>
    createSafeLogMessage(`No tool configurations found in ${toolConfigsDir}`),
  toolCheckingUpdates: (toolName: string) => createSafeLogMessage(`updates for ${toolName}`),
  toolUpdateAvailable: (toolName: string, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(`Update available for ${toolName}: ${currentVersion} -> ${latestVersion}`),
  toolUpToDate: (toolName: string, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(`${toolName} (${currentVersion}) is up to date. Latest: ${latestVersion}`),
  toolAheadOfLatest: (toolName: string, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(`${toolName} (${currentVersion}) is ahead of the latest known version (${latestVersion})`),
  toolConfiguredToLatest: (toolName: string, latestVersion: string) =>
    createSafeLogMessage(
      `Tool "${toolName}" is configured to 'latest'. The latest available version is ${latestVersion}`
    ),
  toolVersionComparisonFailed: (toolName: string, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(
      `Could not determine update status for ${toolName} (${currentVersion}) against latest ${latestVersion}`
    ),
  toolShimUpToDate: (toolName: string, version: string) =>
    createSafeLogMessage(`${toolName} is already up to date (${version})`),
  toolShimOnLatest: (toolName: string, version: string) =>
    createSafeLogMessage(`${toolName} is already on latest version (${version})`),
  toolShimUpdateStarting: (toolName: string, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(`Updating ${toolName} from ${currentVersion} to ${latestVersion}...`),
  toolProcessingUpdate: (toolName: string, currentVersion: string, latestVersion: string) =>
    createSafeLogMessage(`${toolName} update from ${currentVersion} to ${latestVersion}`),
  toolShimUpdateSuccess: (toolName: string, version: string) =>
    createSafeLogMessage(`${toolName} successfully updated to ${version}`),
  toolUpdated: (toolName: string, fromVersion: string, toVersion: string) =>
    createSafeLogMessage(`Tool "${toolName}" updated from v${fromVersion} to v${toVersion}`),
  toolUpdateFailed: (toolName: string, reason: string) =>
    createSafeLogMessage(`Update failed for tool "${toolName}": ${reason}`),
  commandCheckingUpdatesFor: (toolName: string) => createSafeLogMessage(`Checking "${toolName}" for updates`),
  commandCheckingUpdatesForAll: () => createSafeLogMessage(`Checking all tools for updates`),
  fsReadFailed: (path: string) => createSafeLogMessage(`Failed to read ${path}`),
  fsAccessDenied: (operation: string, path: string) => createSafeLogMessage(`Access denied ${operation}: ${path}`),
  fsItemNotFound: (itemType: string, path: string) => createSafeLogMessage(`${itemType} not found: ${path}`),
  fsWrite: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] write ${path}`),
  toolConflictsDetected: (header: string, conflicts: string) => createSafeLogMessage(`${header}\n${conflicts}`),
  noConflictsDetected: () => createSafeLogMessage('No conflicts detected'),
  cleanupAllTrackedFiles: () => createSafeLogMessage('Registry-based cleanup: Removing all tracked files'),
  cleanupRegistryDatabase: () => createSafeLogMessage('registry database cleanup'),
  cleanupRegistryDryRun: () => createSafeLogMessage('Would clean up registry database (dry run)'),
  cleanupToolFiles: (toolName: string) => createSafeLogMessage(`Registry-based cleanup: files for tool '${toolName}'`),
  cleanupRegistryTool: (toolName: string, dryRun: boolean) =>
    createSafeLogMessage(
      dryRun
        ? `Would remove registry entries for tool: ${toolName} (dry run)`
        : `Removed registry entries for tool: ${toolName}`
    ),
  cleanupTypeFiles: (fileType: string) => createSafeLogMessage(`Registry-based cleanup: files of type '${fileType}'`),
  cleanupFoundFiles: (count: number, toolName: string, fileType?: string) =>
    createSafeLogMessage(`Found ${count} files for tool '${toolName}'${fileType ? ` of type '${fileType}'` : ''}`),
  cleanupFileRemoved: (path: string) => createSafeLogMessage(`[cleanup] rm ${path}`),
  fileCleanupDryRun: (filePath: string) => createSafeLogMessage(`Would delete: ${filePath}`),
  cleanupFileNotFound: (filePath: string) => createSafeLogMessage(`file not found ${filePath}`),
  cleanupDeleteFailed: (filePath: string) => createSafeLogMessage(`Failed to delete ${filePath}`),
  cleanupProcessStarted: (dryRun: boolean) => createSafeLogMessage(`starting cleanup process, dryRun=${dryRun}: %O`),
  operationStarted: (operation: string) => createSafeLogMessage(`${operation} started`),
  operationCompleted: (operation: string) => createSafeLogMessage(`${operation} completed`),
  operationFailed: (operation: string) => createSafeLogMessage(`${operation} failed`),
  configParameterOverridden: (field: string, value: string) =>
    createSafeLogMessage(`${field.charAt(0).toUpperCase() + field.slice(1)} overridden to: ${value}`),
  cleanupProcessFinished: (dryRun: boolean) => createSafeLogMessage(`cleanup process finished, dryRun=${dryRun}`),
  filesCheckingFileStates: () => createSafeLogMessage('Checking file states for all tools'),
  filesFileStatesForTool: (toolName: string) => createSafeLogMessage(`${toolName} files`),
  filesFileStatus: (statusIcon: string, filePath: string, fileType: string, statusText: string, sizeText: string) =>
    createSafeLogMessage(`${statusIcon} ${filePath} [${fileType}] - ${statusText}${sizeText}`),
  filesTargetStatus: (targetIcon: string, targetPath: string) => createSafeLogMessage(`${targetIcon} ${targetPath}`),
  filesNoOperationsFound: () => createSafeLogMessage('No file operations found matching criteria'),
  filesOperationHistory: (timestamp: string, operationMessage: string, metadata: string) =>
    createSafeLogMessage(`${timestamp} ${operationMessage}${metadata ? ` ${metadata}` : ''}`),
  cachingDisabled: () => createSafeLogMessage('Caching disabled'),
  registryInitialized: (path: string) => createSafeLogMessage(`File tracking initialized: ${path}`),
  servicesSetup: () => createSafeLogMessage('Services setup complete'),
  cliStarted: () => createSafeLogMessage('CLI starting with arguments'),
  serviceGithubResourceNotFound: (resource: string, identifier: string) =>
    createSafeLogMessage(`GitHub ${resource} not found: ${identifier}`),
  serviceGithubApiFailed: (operation: string, status: number) =>
    createSafeLogMessage(`GitHub API failed [${operation}] ${status}`),
  configLoadFailed: (configPath: string) => createSafeLogMessage(`Failed to load configuration from ${configPath}`),
  configParameterIgnored: (field: string, reason: string) =>
    createSafeLogMessage(`Configuration field "${field}" ignored: ${reason}`),
  configParameterInvalid: (field: string, value: string, expected: string) =>
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
  updatesCommandCompleted: () => createSafeLogMessage('Check-updates command completed'),
} satisfies SafeLogMessageMap;
