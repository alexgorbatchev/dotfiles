import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cargoClientWarningTemplates = {
  cacheStoreError: () => createSafeLogMessage('Failed to store cache entry for %s: %s'),
  cacheReadError: () => createSafeLogMessage('Failed to read cache entry for %s: %s'),
  cacheDegraded: () => createSafeLogMessage('Caching degraded for %s; continuing without cache'),
} satisfies SafeLogMessageMap;
