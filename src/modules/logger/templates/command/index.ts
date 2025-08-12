import { commandDebugTemplates } from './debug';
import { commandErrorTemplates } from './error';

/**
 * Command execution and CLI templates grouped by log level
 */
export const command = {
  error: commandErrorTemplates,
  debug: commandDebugTemplates,
} as const;
