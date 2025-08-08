import { configErrorTemplates } from './config/error';
import { configWarningTemplates } from './config/warning';
import { configSuccessTemplates } from './config/success';

/**
 * Configuration loading and validation templates grouped by log level
 */
export const config = {
  error: configErrorTemplates,
  warning: configWarningTemplates,
  success: configSuccessTemplates,
} as const;