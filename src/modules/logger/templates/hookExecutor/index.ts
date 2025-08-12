import { hookExecutorDebugTemplates } from './debug';

/**
 * Hook execution templates grouped by log level
 */
export const hookExecutor = {
  debug: hookExecutorDebugTemplates,
} as const;
