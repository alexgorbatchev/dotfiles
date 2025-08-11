import { commandErrorTemplates } from './error';
import { commandDebugTemplates } from './debug';

/**
 * Command execution and CLI templates grouped by log level
 */
export const command = {
  error: commandErrorTemplates,
  debug: commandDebugTemplates,
} as const;