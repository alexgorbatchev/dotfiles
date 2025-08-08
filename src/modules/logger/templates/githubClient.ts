import { githubClientDebugTemplates } from './githubClient/debug';

/**
 * GitHub client operation templates grouped by log level
 */
export const githubClient = {
  debug: githubClientDebugTemplates,
} as const;