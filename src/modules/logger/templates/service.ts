import { serviceErrorTemplates } from './service/error';
import { serviceWarningTemplates } from './service/warning';

/**
 * External service integration templates grouped by log level
 */
export const service = {
  error: serviceErrorTemplates,
  warning: serviceWarningTemplates,
} as const;