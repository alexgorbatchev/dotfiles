import { extractorDebugTemplates } from './extractor/debug';

/**
 * Extractor operation templates grouped by log level
 */
export const extractor = {
  debug: extractorDebugTemplates,
} as const;