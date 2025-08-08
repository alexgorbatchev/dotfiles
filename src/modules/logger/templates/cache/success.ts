import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cacheSuccessTemplates = {
  hit: (key: string, strategy: string, size?: number): SafeLogMessage => {
    const sizeStr = size !== undefined ? `, size: ${size} bytes` : '';
    return createSafeLogMessage(`Cache hit for key: ${key} (${strategy})${sizeStr}`);
  },
  stored: (key: string, strategy: string, expiresAt: string, size?: number): SafeLogMessage => {
    const sizeStr = size !== undefined ? `, size: ${size} bytes` : '';
    return createSafeLogMessage(`Cached data for key: ${key} (${strategy})${sizeStr}, expires: ${expiresAt}`);
  },
  removed: (key: string): SafeLogMessage => 
    createSafeLogMessage(`Removed cache entry for key: ${key}`),
  cleared: (): SafeLogMessage => 
    createSafeLogMessage('Removed entire cache directory'),
  expiredCleared: (count: number): SafeLogMessage => 
    createSafeLogMessage(`Removed ${count} expired cache entries`),
  entryExists: (key: string): SafeLogMessage => 
    createSafeLogMessage(`Valid cache entry exists for key: ${key}`),
} as const;