import { commandErrorTemplates } from './command/error';
import { commandDebugTemplates } from './command/debug';

/**
 * Command execution and CLI templates grouped by log level
 */
export const command = {
  error: commandErrorTemplates,
  debug: commandDebugTemplates,
} as const;