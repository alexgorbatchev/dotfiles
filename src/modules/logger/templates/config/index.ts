import { configErrorTemplates } from './error';
import { configSuccessTemplates } from './success';
import { configWarningTemplates } from './warning';

/**
 * Configuration loading and validation templates grouped by log level
 */
export const config = {
  error: configErrorTemplates,
  warning: configWarningTemplates,
  success: configSuccessTemplates,
} as const;
