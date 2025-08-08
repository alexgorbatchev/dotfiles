import { fsErrorTemplates } from './fs/error';
import { fsWarningTemplates } from './fs/warning';
import { fsSuccessTemplates } from './fs/success';
import { fsDebugTemplates } from './fs/debug';

/**
 * File system operation templates grouped by log level
 */
export const fs = {
  error: fsErrorTemplates,
  warning: fsWarningTemplates,
  success: fsSuccessTemplates,
  debug: fsDebugTemplates,
} as const;