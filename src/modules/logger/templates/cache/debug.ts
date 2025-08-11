import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cacheDebugTemplates = {
  disabled: (operation: string, key: string) => 
    createSafeLogMessage(`Cache disabled, ${operation} for key: ${key}`),
  notFound: (key: string) => 
    createSafeLogMessage(`No cache entry found for key: ${key}`),
  expired: (key: string) => 
    createSafeLogMessage(`Cache entry expired for key: ${key}`),
  binaryFileMissing: (key: string, path: string) => 
    createSafeLogMessage(`Binary file missing for key: ${key}, path: ${path}`),
  directoryNotExist: () => 
    createSafeLogMessage('Cache directory does not exist, nothing to clear'),
  noEntryToDelete: (key: string) => 
    createSafeLogMessage(`No cache entry to delete for key: ${key}`),
  constructorDebug: (cacheDir: string, ttl: number, strategy: string, enabled: boolean) => 
    createSafeLogMessage(`Cache directory: ${cacheDir}, TTL: ${ttl} ms, Strategy: ${strategy}, Enabled: ${enabled}`),
  fileProcessingError: (file: string, reason: string) => 
    createSafeLogMessage(`Error processing cache file ${file}: ${reason}`),
  cachedDownloadStrategyCreated: (strategyName: string, ttl: number) => 
    createSafeLogMessage(`Wrapping strategy ${strategyName} with cache, TTL: ${ttl} ms`),
} satisfies SafeLogMessageMap;