import { generalWarningTemplates } from './warning';
import { generalSuccessTemplates } from './success';

/**
 * General templates grouped by log level
 */
export const general = {
  warning: generalWarningTemplates,
  success: generalSuccessTemplates,
} as const;