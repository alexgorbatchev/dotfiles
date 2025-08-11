import { cacheErrorTemplates } from './error';
import { cacheSuccessTemplates } from './success';
import { cacheDebugTemplates } from './debug';

/**
 * Cache operation templates grouped by log level
 */
export const cache = {
  error: cacheErrorTemplates,
  success: cacheSuccessTemplates,
  debug: cacheDebugTemplates,
} as const;