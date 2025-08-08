import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const generalSuccessTemplates = {
  started: (operation: string): SafeLogMessage => createSafeLogMessage(`${operation} started`),
  completed: (operation: string): SafeLogMessage => createSafeLogMessage(`${operation} completed`),
  done: (isDryRun?: boolean): SafeLogMessage => createSafeLogMessage(`DONE${isDryRun ? ' (dry run)' : ''}`),
  initialized: (component: string): SafeLogMessage => createSafeLogMessage(`${component} initialized`),
  toolConfigsForDryRun: (): SafeLogMessage => createSafeLogMessage('tool configs for dry run'),
  generatedShimsByTool: (): SafeLogMessage => createSafeLogMessage('Generated shims by tool'),
  cliStarted: (): SafeLogMessage => createSafeLogMessage('CLI starting with arguments'),
  dryRunEnabled: (): SafeLogMessage => createSafeLogMessage('Dry run enabled. Initializing MemFileSystem'),
  servicesSetup: (): SafeLogMessage => createSafeLogMessage('Services setup complete'),
  cachingEnabled: (): SafeLogMessage => createSafeLogMessage('Caching enabled'),
  cachingDisabled: (): SafeLogMessage => createSafeLogMessage('Caching disabled'),
  noConflictsDetected: (): SafeLogMessage => createSafeLogMessage('No conflicts detected'),
  checkingUpdates: (toolName: string): SafeLogMessage => createSafeLogMessage(`updates for ${toolName}`),
  checkingUpdatesFor: (toolName: string): SafeLogMessage => createSafeLogMessage(`updates check for "${toolName}"`),
  processingUpdate: (toolName: string, fromVersion: string, toVersion: string): SafeLogMessage => createSafeLogMessage(`${toolName} update from ${fromVersion} to ${toVersion}`),
  noToolsFound: (toolConfigDir: string): SafeLogMessage => createSafeLogMessage(`No tool configurations found in ${toolConfigDir}`),
  toolOnLatest: (toolName: string, version: string): SafeLogMessage => createSafeLogMessage(`Tool "${toolName}" is configured to 'latest'. The latest available version is ${version}`),
  updateAvailable: (toolName: string, current: string, latest: string): SafeLogMessage => createSafeLogMessage(`Update available for ${toolName}: ${current} -> ${latest}`),
  toolUpToDate: (toolName: string, current: string, latest: string): SafeLogMessage => createSafeLogMessage(`${toolName} (${current}) is up to date. Latest: ${latest}`),
  toolAhead: (toolName: string, current: string, latest: string): SafeLogMessage => createSafeLogMessage(`${toolName} (${current}) is ahead of the latest known version (${latest})`),
  shimUpdateStarting: (toolName: string, fromVersion: string, toVersion: string): SafeLogMessage => createSafeLogMessage(`Updating ${toolName} from ${fromVersion} to ${toVersion}...`),
  shimUpdateSuccess: (toolName: string, version: string): SafeLogMessage => createSafeLogMessage(`${toolName} successfully updated to ${version}`),
  shimToolUpToDate: (toolName: string, version: string): SafeLogMessage => createSafeLogMessage(`${toolName} is already up to date (${version})`),
  shimToolOnLatest: (toolName: string, version: string): SafeLogMessage => createSafeLogMessage(`${toolName} is already on latest version (${version})`),
  cleanupAllTrackedFiles: (): SafeLogMessage => createSafeLogMessage('Registry-based cleanup: Removing all tracked files'),
  cleanupRegistryDatabase: (): SafeLogMessage => createSafeLogMessage('registry database cleanup'),
  cleanupToolFiles: (tool: string): SafeLogMessage => createSafeLogMessage(`Registry-based cleanup: files for tool '${tool}'`),
  cleanupTypeFiles: (type: string): SafeLogMessage => createSafeLogMessage(`Registry-based cleanup: files of type '${type}'`),
  cleanupShimDeletion: (): SafeLogMessage => createSafeLogMessage('shim deletion'),
  cleanupShellInitDeletion: (): SafeLogMessage => createSafeLogMessage('shell init file deletion'),
  cleanupSymlinkDeletion: (): SafeLogMessage => createSafeLogMessage('symlink deletion'),
  cleanupRegistryDryRun: (): SafeLogMessage => createSafeLogMessage('Would clean up registry database (dry run)'),
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
} as const;