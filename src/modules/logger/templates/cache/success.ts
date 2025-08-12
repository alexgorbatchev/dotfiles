import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cacheSuccessTemplates = {
  hit: (key: string, strategy: string, size?: number) => {
    const sizeStr = size !== undefined ? `, size: ${size} bytes` : '';
    return createSafeLogMessage(`Cache hit for key: ${key} (${strategy})${sizeStr}`);
  },
  stored: (key: string, strategy: string, expiresAt: string, size?: number) => {
    const sizeStr = size !== undefined ? `, size: ${size} bytes` : '';
    return createSafeLogMessage(`Cached data for key: ${key} (${strategy})${sizeStr}, expires: ${expiresAt}`);
  },
  removed: (key: string) => createSafeLogMessage(`Removed cache entry for key: ${key}`),
  cleared: () => createSafeLogMessage('Removed entire cache directory'),
  expiredCleared: (count: number) => createSafeLogMessage(`Removed ${count} expired cache entries`),
  entryExists: (key: string) => createSafeLogMessage(`Valid cache entry exists for key: ${key}`),
} satisfies SafeLogMessageMap;
