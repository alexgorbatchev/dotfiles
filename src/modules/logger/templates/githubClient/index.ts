import { githubClientDebugTemplates } from './debug';

/**
 * GitHub API client operation templates grouped by log level
 */
export const githubClient = {
  debug: githubClientDebugTemplates,
} as const;