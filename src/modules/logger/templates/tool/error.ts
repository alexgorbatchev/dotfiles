import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const toolErrorTemplates = {
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
  shimConflict: (toolName: string, filePath: string): SafeLogMessage =>
    createSafeLogMessage(`Cannot create shim for "${toolName}": conflicting file exists at ${filePath}. Use --overwrite to replace it.`),
} as const;