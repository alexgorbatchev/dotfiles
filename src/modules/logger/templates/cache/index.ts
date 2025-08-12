import { cacheDebugTemplates } from './debug';
import { cacheErrorTemplates } from './error';
import { cacheSuccessTemplates } from './success';

/**
 * Cache operation templates grouped by log level
 */
export const cache = {
  error: cacheErrorTemplates,
  success: cacheSuccessTemplates,
  debug: cacheDebugTemplates,
} as const;
