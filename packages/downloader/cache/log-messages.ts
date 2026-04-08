import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  initialized: (cacheDir: string, defaultTtl: number, strategy: string, enabled: boolean) =>
    createSafeLogMessage(
      `Cache directory: ${cacheDir}, TTL: ${defaultTtl} ms, Strategy: ${strategy}, Enabled: ${enabled}`,
    ),
  cachingDisabled: (operation: string, key: string) =>
    createSafeLogMessage(`Cache disabled, ${operation} for key: ${key}`),
  entryMissing: (key: string) => createSafeLogMessage(`No cache entry found for key: ${key}`),
  entryExpired: (key: string) => createSafeLogMessage(`Cache entry expired for key: ${key}`),
  cacheHit: (key: string, strategy: string, size?: number) => {
    const sizeDescription = size !== undefined ? `, size: ${size} bytes` : "";
    return createSafeLogMessage(`Cache hit for key: ${key} (${strategy})${sizeDescription}`);
  },
  cacheStored: (key: string, strategy: string, expiresAt: string, size?: number) => {
    const sizeDescription = size !== undefined ? `, size: ${size} bytes` : "";
    return createSafeLogMessage(`Cached data for key: ${key} (${strategy})${sizeDescription}, expires: ${expiresAt}`);
  },
  cacheEntryRemoved: (key: string) => createSafeLogMessage(`Removed cache entry for key: ${key}`),
  cacheCleared: () => createSafeLogMessage("Removed entire cache directory"),
  expiredEntriesCleared: (count: number) => createSafeLogMessage(`Removed ${count} expired cache entries`),
  cacheEntryExists: (key: string) => createSafeLogMessage(`Valid cache entry exists for key: ${key}`),
  noEntryToDelete: (key: string) => createSafeLogMessage(`No cache entry to delete for key: ${key}`),
  cacheDirectoryMissing: () => createSafeLogMessage("Cache directory does not exist, nothing to clear"),
  binaryFileMissing: (key: string, filePath: string) =>
    createSafeLogMessage(`Binary file missing for key: ${key}, path: ${filePath}`),
  contentHashMismatch: (key: string, expected: string, actual: string) =>
    createSafeLogMessage(`Content hash mismatch for key: ${key}, expected: ${expected}, actual: ${actual}`),
  metadataProcessingWarning: (file: string, reason: string) =>
    createSafeLogMessage(`Error processing cache file ${file}: ${reason}`),
  retrievalFailed: (key: string, reason: string) =>
    createSafeLogMessage(`Error retrieving cache for key: ${key}, error: ${reason}`),
  storageFailed: (key: string, reason: string) =>
    createSafeLogMessage(`Error caching data for key: ${key}, error: ${reason}`),
  checkFailed: (key: string, reason: string) =>
    createSafeLogMessage(`Error checking cache for key: ${key}, error: ${reason}`),
  deleteFailed: (key: string, reason: string) =>
    createSafeLogMessage(`Error deleting cache entry for key: ${key}, error: ${reason}`),
  clearExpiredFailed: (reason: string) => createSafeLogMessage(`Error clearing expired cache entries: ${reason}`),
  clearFailed: (reason: string) => createSafeLogMessage(`Error clearing cache: ${reason}`),
  directoryCreationFailed: (reason: string) =>
    createSafeLogMessage(`Error ensuring cache directories exist: ${reason}`),
  binaryDirectoryNotConfigured: () => createSafeLogMessage("Binary directory not configured for binary strategy"),
  binaryDataRequired: () => createSafeLogMessage("Binary storage strategy requires Buffer data"),
} satisfies SafeLogMessageMap;
