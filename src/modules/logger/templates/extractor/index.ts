import { extractorDebugTemplates } from './debug';

/**
 * Extractor operation templates grouped by log level
 */
export const extractor = {
  debug: extractorDebugTemplates,
} as const;
