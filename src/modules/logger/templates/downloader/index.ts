import { downloaderSuccessTemplates } from './success';
import { downloaderDebugTemplates } from './debug';

/**
 * Downloader operation templates grouped by log level
 */
export const downloader = {
  success: downloaderSuccessTemplates,
  debug: downloaderDebugTemplates,
} as const;