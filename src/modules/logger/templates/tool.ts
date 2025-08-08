import { toolErrorTemplates } from './tool/error';
import { toolWarningTemplates } from './tool/warning';
import { toolSuccessTemplates } from './tool/success';

/**
 * Tool lifecycle operation templates grouped by log level
 */
export const tool = {
  error: toolErrorTemplates,
  warning: toolWarningTemplates,
  success: toolSuccessTemplates,
} as const;