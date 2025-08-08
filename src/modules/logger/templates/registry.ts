import { registrySuccessTemplates } from './registry/success';
import { registryDebugTemplates } from './registry/debug';

/**
 * Registry operation templates grouped by log level
 */
export const registry = {
  success: registrySuccessTemplates,
  debug: registryDebugTemplates,
} as const;