import { fsErrorTemplates } from './error';
import { fsWarningTemplates } from './warning';
import { fsSuccessTemplates } from './success';
import { fsDebugTemplates } from './debug';

/**
 * File system operation templates grouped by log level
 */
export const fs = {
  error: fsErrorTemplates,
  warning: fsWarningTemplates,
  success: fsSuccessTemplates,
  debug: fsDebugTemplates,
} as const;