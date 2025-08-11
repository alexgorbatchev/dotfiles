import { registrySuccessTemplates } from './success';
import { registryDebugTemplates } from './debug';

/**
 * Registry operation templates grouped by log level
 */
export const registry = {
  success: registrySuccessTemplates,
  debug: registryDebugTemplates,
} as const;