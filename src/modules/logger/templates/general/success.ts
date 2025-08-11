import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const generalSuccessTemplates = {
  started: (operation: string) => createSafeLogMessage(`${operation} started`),
  completed: (operation: string) => createSafeLogMessage(`${operation} completed`),
  done: (isDryRun?: boolean) => createSafeLogMessage(`DONE${isDryRun ? ' (dry run)' : ''}`),
  initialized: (component: string) => createSafeLogMessage(`${component} initialized`),
  toolConfigsForDryRun: () => createSafeLogMessage('tool configs for dry run'),
  generatedShimsByTool: () => createSafeLogMessage('Generated shims by tool'),
  cliStarted: () => createSafeLogMessage('CLI starting with arguments'),
  dryRunEnabled: () => createSafeLogMessage('Dry run enabled. Initializing MemFileSystem'),
  servicesSetup: () => createSafeLogMessage('Services setup complete'),
  cachingEnabled: () => createSafeLogMessage('Caching enabled'),
  cachingDisabled: () => createSafeLogMessage('Caching disabled'),
  noConflictsDetected: () => createSafeLogMessage('No conflicts detected'),
  checkingUpdates: (toolName: string) => createSafeLogMessage(`updates for ${toolName}`),
  checkingUpdatesFor: (toolName: string) => createSafeLogMessage(`updates check for "${toolName}"`),
  processingUpdate: (toolName: string, fromVersion: string, toVersion: string) => createSafeLogMessage(`${toolName} update from ${fromVersion} to ${toVersion}`),
  noToolsFound: (toolConfigDir: string) => createSafeLogMessage(`No tool configurations found in ${toolConfigDir}`),
  toolOnLatest: (toolName: string, version: string) => createSafeLogMessage(`Tool "${toolName}" is configured to 'latest'. The latest available version is ${version}`),
  updateAvailable: (toolName: string, current: string, latest: string) => createSafeLogMessage(`Update available for ${toolName}: ${current} -> ${latest}`),
  toolUpToDate: (toolName: string, current: string, latest: string) => createSafeLogMessage(`${toolName} (${current}) is up to date. Latest: ${latest}`),
  toolAhead: (toolName: string, current: string, latest: string) => createSafeLogMessage(`${toolName} (${current}) is ahead of the latest known version (${latest})`),
  shimUpdateStarting: (toolName: string, fromVersion: string, toVersion: string) => createSafeLogMessage(`Updating ${toolName} from ${fromVersion} to ${toVersion}...`),
  shimUpdateSuccess: (toolName: string, version: string) => createSafeLogMessage(`${toolName} successfully updated to ${version}`),
  shimToolUpToDate: (toolName: string, version: string) => createSafeLogMessage(`${toolName} is already up to date (${version})`),
  shimToolOnLatest: (toolName: string, version: string) => createSafeLogMessage(`${toolName} is already on latest version (${version})`),
  cleanupAllTrackedFiles: () => createSafeLogMessage('Registry-based cleanup: Removing all tracked files'),
  cleanupRegistryDatabase: () => createSafeLogMessage('registry database cleanup'),
  cleanupToolFiles: (tool: string) => createSafeLogMessage(`Registry-based cleanup: files for tool '${tool}'`),
  cleanupTypeFiles: (type: string) => createSafeLogMessage(`Registry-based cleanup: files of type '${type}'`),
  cleanupShimDeletion: () => createSafeLogMessage('shim deletion'),
  cleanupShellInitDeletion: () => createSafeLogMessage('shell init file deletion'),
  cleanupSymlinkDeletion: () => createSafeLogMessage('symlink deletion'),
  cleanupRegistryDryRun: () => createSafeLogMessage('Would clean up registry database (dry run)'),
  checkingFileStates: () => createSafeLogMessage('Checking file states for all tools'),
  fileStatesForTool: (toolName: string) => createSafeLogMessage(`${toolName} files`),
  noFileOperationsFound: () => createSafeLogMessage('No file operations found matching criteria'),
  listingFileOperations: () => createSafeLogMessage('Listing file operations by tool'),
  operationInfo: (operationType: string, filePath: string) => createSafeLogMessage(`${operationType}: ${filePath}`),
  operationDetails: (fileType: string, timestamp: string, sizeText: string) => createSafeLogMessage(`Type: ${fileType} | Time: ${timestamp}${sizeText}`),
  operationTarget: (targetPath: string) => createSafeLogMessage(`Target: ${targetPath}`),
  operationMetadata: (metadata: string) => createSafeLogMessage(`Metadata: ${metadata}`),
  toolOperations: (toolName: string, count: number) => createSafeLogMessage(`${toolName} (${count} operations):`),
  fileReport: () => createSafeLogMessage('File Status Report'),
  fileReportSeparator: () => createSafeLogMessage('=================='),
  operationsReport: (count: number) => createSafeLogMessage(`Found ${count} tracked file operations`),
  operationsReportSeparator: () => createSafeLogMessage('============================================'),
  fileStatus: (statusIcon: string, filePath: string, fileType: string, statusText: string, sizeText: string) => 
    createSafeLogMessage(`${statusIcon} ${filePath} [${fileType}] - ${statusText}${sizeText}`),
  targetStatus: (targetIcon: string, targetPath: string) => 
    createSafeLogMessage(`${targetIcon} ${targetPath}`),
  symlinkOperation: (targetPath: string, sourcePath: string, status: string, error?: string) => {
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
  cleanupRegistryTool: (tool: string, dryRun: boolean) => 
    createSafeLogMessage(dryRun ? `Would remove registry entries for tool: ${tool} (dry run)` : `Removed registry entries for tool: ${tool}`),
  fileCleanupDryRun: (filePath: string) => createSafeLogMessage(`Would delete: ${filePath}`),
  directoryCleanupInfo: (dirPath: string, exists: boolean, dryRun: boolean) => {
    if (!exists) return createSafeLogMessage(`Generated directory not found, skipping: ${dirPath}`);
    if (dryRun) return createSafeLogMessage(`Would delete generated directory: ${dirPath}`);
    return createSafeLogMessage(`deleted generated directory ${dirPath}`);
  },
  // Legacy methods for backward compatibility
  operationComplete: (operation: string) => createSafeLogMessage(`${operation} completed successfully`),
  cleanup: (resource: string) => createSafeLogMessage(`Cleaned up ${resource}`),
  validated: (item: string) => createSafeLogMessage(`${item} validated successfully`),
} satisfies SafeLogMessageMap;