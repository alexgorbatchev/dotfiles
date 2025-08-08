import { shellInitDebugTemplates } from './shellInit/debug';

/**
 * Shell initialization templates grouped by log level
 */
export const shellInit = {
  debug: shellInitDebugTemplates,
} as const;