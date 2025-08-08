import { downloaderSuccessTemplates } from './downloader/success';
import { downloaderDebugTemplates } from './downloader/debug';

/**
 * Downloader operation templates grouped by log level
 */
export const downloader = {
  success: downloaderSuccessTemplates,
  debug: downloaderDebugTemplates,
} as const;