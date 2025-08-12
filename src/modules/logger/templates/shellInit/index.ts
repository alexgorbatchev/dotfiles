import { shellInitDebugTemplates } from './debug';

/**
 * Shell initialization templates grouped by log level
 */
export const shellInit = {
  debug: shellInitDebugTemplates,
} as const;
