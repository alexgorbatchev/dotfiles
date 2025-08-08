import { versionCheckerDebugTemplates } from './versionChecker/debug';

/**
 * Version checker operation templates grouped by log level
 */
export const versionChecker = {
  debug: versionCheckerDebugTemplates,
} as const;