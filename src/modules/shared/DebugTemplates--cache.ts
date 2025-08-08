import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const cacheDebugTemplates = {
  disabled: (operation: string, key: string): SafeLogMessage => 
    createSafeLogMessage(`Cache disabled, ${operation} for key: ${key}`),
  notFound: (key: string): SafeLogMessage => 
    createSafeLogMessage(`No cache entry found for key: ${key}`),
  expired: (key: string): SafeLogMessage => 
    createSafeLogMessage(`Cache entry expired for key: ${key}`),
  binaryFileMissing: (key: string, path: string): SafeLogMessage => 
    createSafeLogMessage(`Binary file missing for key: ${key}, path: ${path}`),
  directoryNotExist: (): SafeLogMessage => 
    createSafeLogMessage('Cache directory does not exist, nothing to clear'),
  noEntryToDelete: (key: string): SafeLogMessage => 
    createSafeLogMessage(`No cache entry to delete for key: ${key}`),
  constructorDebug: (cacheDir: string, ttl: number, strategy: string, enabled: boolean): SafeLogMessage => 
    createSafeLogMessage(`Cache directory: ${cacheDir}, TTL: ${ttl} ms, Strategy: ${strategy}, Enabled: ${enabled}`),
  fileProcessingError: (file: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Error processing cache file ${file}: ${reason}`),
  cachedDownloadStrategyCreated: (strategyName: string, ttl: number): SafeLogMessage => 
    createSafeLogMessage(`Wrapping strategy ${strategyName} with cache, TTL: ${ttl} ms`),
} as const;