import { serviceErrorTemplates } from './error';
import { serviceWarningTemplates } from './warning';

/**
 * External service integration templates grouped by log level
 */
export const service = {
  error: serviceErrorTemplates,
  warning: serviceWarningTemplates,
} as const;
