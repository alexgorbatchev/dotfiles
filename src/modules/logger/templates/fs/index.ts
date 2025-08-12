import { fsDebugTemplates } from './debug';
import { fsErrorTemplates } from './error';
import { fsSuccessTemplates } from './success';
import { fsWarningTemplates } from './warning';

/**
 * File system operation templates grouped by log level
 */
export const fs = {
  error: fsErrorTemplates,
  warning: fsWarningTemplates,
  success: fsSuccessTemplates,
  debug: fsDebugTemplates,
} as const;
