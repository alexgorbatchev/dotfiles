import type { TsLogger } from '@dotfiles/logger';
import type { IDashboardServices } from '../types';
import { getActivity } from './activity';
import { getConfig } from './config';
import { getHealth } from './health';
import { getRecentTools } from './recent-tools';
import { clearToolConfigsCache } from './shared';
import { getShellIntegration } from './shell-integration';
import { getStats } from './stats';
import { getToolConfigsTree } from './tool-configs-tree';
import { getToolHistory } from './tool-history';
import { getToolReadme } from './tool-readme';
import { getTools } from './tools';

/**
 * Creates API route handlers for the dashboard.
 */
export function createApiRoutes(parentLogger: TsLogger, services: IDashboardServices) {
  const logger = parentLogger.getSubLogger({ name: 'api' });

  return {
    getTools: () => getTools(logger, services),
    getStats: () => getStats(logger, services),
    getHealth: () => getHealth(logger, services),
    getConfig: () => getConfig(logger, services),
    getToolConfigsTree: () => getToolConfigsTree(logger, services),
    getShellIntegration: () => getShellIntegration(logger, services),
    getActivity: (limit?: number) => getActivity(logger, services, limit),
    getToolHistory: (toolName: string) => getToolHistory(logger, services, toolName),
    getToolReadme: (toolName: string) => getToolReadme(logger, services, toolName),
    getRecentTools: (limit?: number) => getRecentTools(logger, services, limit),
  };
}

export type ApiRoutes = ReturnType<typeof createApiRoutes>;

// Export cache clearing function for testing
export { clearToolConfigsCache };
