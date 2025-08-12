import { generalErrorTemplates } from './error';
import { generalSuccessTemplates } from './success';
import { generalWarningTemplates } from './warning';

/**
 * General templates grouped by log level
 */
export const general = {
  error: generalErrorTemplates,
  warning: generalWarningTemplates,
  success: generalSuccessTemplates,
} as const;
