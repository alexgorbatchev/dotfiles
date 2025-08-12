import { toolErrorTemplates } from './error';
import { toolSuccessTemplates } from './success';
import { toolWarningTemplates } from './warning';

/**
 * Tool lifecycle operation templates grouped by log level
 */
export const tool = {
  error: toolErrorTemplates,
  warning: toolWarningTemplates,
  success: toolSuccessTemplates,
} as const;
