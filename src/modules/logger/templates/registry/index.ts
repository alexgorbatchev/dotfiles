import { registryDebugTemplates } from './debug';
import { registrySuccessTemplates } from './success';

/**
 * Registry operation templates grouped by log level
 */
export const registry = {
  success: registrySuccessTemplates,
  debug: registryDebugTemplates,
} as const;
