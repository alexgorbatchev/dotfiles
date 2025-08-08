import { hookExecutorDebugTemplates } from './hookExecutor/debug';

/**
 * Hook executor operation templates grouped by log level
 */
export const hookExecutor = {
  debug: hookExecutorDebugTemplates,
} as const;