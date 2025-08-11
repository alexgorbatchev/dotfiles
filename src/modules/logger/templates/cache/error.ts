import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cacheErrorTemplates = {
  retrievalFailed: (key: string, reason: string) => 
    createSafeLogMessage(`Error retrieving cache for key: ${key}, error: ${reason}`),
  storageFailed: (key: string, reason: string) => 
    createSafeLogMessage(`Error caching data for key: ${key}, error: ${reason}`),
  checkFailed: (key: string, reason: string) => 
    createSafeLogMessage(`Error checking cache for key: ${key}, error: ${reason}`),
  deleteFailed: (key: string, reason: string) => 
    createSafeLogMessage(`Error deleting cache entry for key: ${key}, error: ${reason}`),
  clearExpiredFailed: (reason: string) => 
    createSafeLogMessage(`Error clearing expired cache entries: ${reason}`),
  clearFailed: (reason: string) => 
    createSafeLogMessage(`Error clearing cache: ${reason}`),
  directoryCreationFailed: (reason: string) => 
    createSafeLogMessage(`Error ensuring cache directories exist: ${reason}`),
  contentHashMismatch: (key: string, expected: string, actual: string) => 
    createSafeLogMessage(`Content hash mismatch for key: ${key}, expected: ${expected}, actual: ${actual}`),
  binaryFileNotConfigured: () => 
    createSafeLogMessage('Binary directory not configured for binary strategy'),
  binaryDataRequired: () => 
    createSafeLogMessage('Binary storage strategy requires Buffer data'),
  fileProcessingError: (file: string, reason: string) => 
    createSafeLogMessage(`Error processing cache file ${file}: ${reason}`),
} satisfies SafeLogMessageMap;