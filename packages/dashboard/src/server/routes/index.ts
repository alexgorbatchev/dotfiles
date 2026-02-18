import type { TsLogger } from '@dotfiles/logger';
import type { IInstallToolRequest } from '../../shared/types';
import type { IDashboardServices } from '../types';
import { getActivity } from './activity';
import { getConfig } from './config';
import { getHealth } from './health';
import { clearGitFirstCommitDatesCache, clearToolConfigsCache } from './helpers';
import { getRecentTools } from './recent-tools';
import { getShellIntegration } from './shell-integration';
import { getStats } from './stats';
import { checkToolUpdate } from './tool-check-update';
import { getToolConfigsTree } from './tool-configs-tree';
import { getToolHistory } from './tool-history';
import { installTool } from './tool-install';
import { getToolReadme } from './tool-readme';
import { getToolSource } from './tool-source';
import { updateTool } from './tool-update';
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
    getToolSource: (toolName: string) => getToolSource(logger, services, toolName),
    getRecentTools: (limit?: number) => getRecentTools(logger, services, limit),
    installTool: (toolName: string, request: IInstallToolRequest) => installTool(logger, services, toolName, request),
    checkToolUpdate: (toolName: string) => checkToolUpdate(logger, services, toolName),
    updateTool: (toolName: string) => updateTool(logger, services, toolName),
  };
}

export type ApiRoutes = ReturnType<typeof createApiRoutes>;

// Export cache clearing functions for testing
export { clearGitFirstCommitDatesCache, clearToolConfigsCache };
