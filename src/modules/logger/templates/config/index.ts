import { configErrorTemplates } from './error';
import { configWarningTemplates } from './warning';
import { configSuccessTemplates } from './success';

/**
 * Configuration loading and validation templates grouped by log level
 */
export const config = {
  error: configErrorTemplates,
  warning: configWarningTemplates,
  success: configSuccessTemplates,
} as const;