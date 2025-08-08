import { archiveErrorTemplates } from './archive/error';

/**
 * Archive and extraction operation templates grouped by log level
 */
export const archive = {
  error: archiveErrorTemplates,
} as const;