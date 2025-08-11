import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const archiveErrorTemplates = {
  extractFailed: (archivePath: string, reason: string) => 
    createSafeLogMessage(`Failed to extract archive ${archivePath}: ${reason}`),
  unsupportedFormat: (archivePath: string, detectedFormat: string) => 
    createSafeLogMessage(`Unsupported archive format: ${archivePath} (detected: ${detectedFormat})`),
  corruptedArchive: (archivePath: string) => 
    createSafeLogMessage(`Archive appears corrupted: ${archivePath}`),
  extractPathNotFound: (archivePath: string, extractPath: string) => 
    createSafeLogMessage(`Extract path not found in archive ${archivePath}: ${extractPath}`),
  noExecutablesFound: (archivePath: string) => 
    createSafeLogMessage(`No executable files found in archive: ${archivePath}`),
} satisfies SafeLogMessageMap;