import { cacheErrorTemplates } from './cache/error';
import { cacheSuccessTemplates } from './cache/success';
import { cacheDebugTemplates } from './cache/debug';

/**
 * Cache operation templates grouped by log level
 */
export const cache = {
  error: cacheErrorTemplates,
  success: cacheSuccessTemplates,
  debug: cacheDebugTemplates,
} as const;