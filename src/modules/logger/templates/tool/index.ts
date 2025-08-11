import { toolErrorTemplates } from './error';
import { toolWarningTemplates } from './warning';
import { toolSuccessTemplates } from './success';

/**
 * Tool lifecycle operation templates grouped by log level
 */
export const tool = {
  error: toolErrorTemplates,
  warning: toolWarningTemplates,
  success: toolSuccessTemplates,
} as const;