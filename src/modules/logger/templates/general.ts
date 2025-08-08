import { generalWarningTemplates } from './general/warning';
import { generalSuccessTemplates } from './general/success';

/**
 * General templates grouped by log level
 */
export const general = {
  warning: generalWarningTemplates,
  success: generalSuccessTemplates,
} as const;