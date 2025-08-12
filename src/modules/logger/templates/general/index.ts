import { generalWarningTemplates } from './warning';
import { generalSuccessTemplates } from './success';
import { generalErrorTemplates } from './error';

/**
 * General templates grouped by log level
 */
export const general = {
  error: generalErrorTemplates,
  warning: generalWarningTemplates,
  success: generalSuccessTemplates,
} as const;