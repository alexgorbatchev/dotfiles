import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

/**
 * Cache operations
 */
export const cacheErrorTemplates = {
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
} as const;