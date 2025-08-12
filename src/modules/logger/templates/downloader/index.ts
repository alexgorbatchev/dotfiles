import { downloaderDebugTemplates } from './debug';
import { downloaderSuccessTemplates } from './success';

/**
 * Downloader operation templates grouped by log level
 */
export const downloader = {
  success: downloaderSuccessTemplates,
  debug: downloaderDebugTemplates,
} as const;
