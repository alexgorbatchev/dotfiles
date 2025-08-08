import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const archiveErrorTemplates = {
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
} as const;