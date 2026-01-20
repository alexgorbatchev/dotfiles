import type { TsLogger } from '@dotfiles/logger';
import type {
  IActivityFeed,
  IApiResponse,
  IConfigSummary,
  IDashboardStats,
  IHealthStatus,
  IShellIntegration,
  IToolDetail,
} from '../shared/types';
import { formatRelativeTime, formatTimestamp, toToolDetail } from '../shared/types';
import { messages } from './log-messages';
import type { IDashboardServices } from './types';

/**
 * Creates API route handlers for the dashboard.
 */
export function createApiRoutes(parentLogger: TsLogger, services: IDashboardServices) {
  const logger = parentLogger.getSubLogger({ name: 'api' });

  return {
    /**
     * GET /api/tools - List all tools with full details
     * Returns tools from both installation registry and file registry
     */
    async getTools(): Promise<IApiResponse<IToolDetail[]>> {
      try {
        // Get tools from installation registry (with version info)
        const installations = await services.toolInstallationRegistry.getAllToolInstallations();
        const installedToolNames = new Set(installations.map((i) => i.toolName));

        // Get all unique tool names from file registry (includes tools without installations)
        const allToolNames = await services.fileRegistry.getRegisteredTools();

        // Build tool details for installed tools
        const installedDetails = await Promise.all(
          installations.map(async (installation) => {
            const files = await services.fileRegistry.getFileStatesForTool(installation.toolName);
            return toToolDetail(installation, files);
          }),
        );

        // Build tool details for tools with files but no installation record
        const uninstalledToolNames = allToolNames.filter((name) => !installedToolNames.has(name));
        const uninstalledDetails: IToolDetail[] = await Promise.all(
          uninstalledToolNames.map(async (toolName) => {
            const files = await services.fileRegistry.getFileStatesForTool(toolName);
            // Create a minimal tool detail without installation info
            return {
              name: toolName,
              version: null,
              status: 'not-installed' as const,
              installMethod: null,
              installPath: null,
              installedAt: null,
              downloadUrl: null,
              assetName: null,
              configuredVersion: null,
              hasUpdate: false,
              binaryPaths: [],
              files,
            };
          }),
        );

        // Combine and sort by name
        const allDetails = [...installedDetails, ...uninstalledDetails].toSorted((a, b) =>
          a.name.localeCompare(b.name)
        );

        return { success: true, data: allDetails };
      } catch (error) {
        logger.error(messages.apiError('getTools'), error);
        return { success: false, error: 'Failed to retrieve tools' };
      }
    },

    /**
     * GET /api/stats - Get dashboard statistics
     */
    async getStats(): Promise<IApiResponse<IDashboardStats>> {
      try {
        const stats = await services.fileRegistry.getStats();
        const installations = await services.toolInstallationRegistry.getAllToolInstallations();

        const dashboardStats: IDashboardStats = {
          toolsInstalled: installations.length,
          updatesAvailable: 0,
          filesTracked: stats.totalFiles,
          totalOperations: stats.totalOperations,
          oldestOperation: stats.oldestOperation > 0 ? formatTimestamp(stats.oldestOperation) : null,
          newestOperation: stats.newestOperation > 0 ? formatTimestamp(stats.newestOperation) : null,
        };
        return { success: true, data: dashboardStats };
      } catch (error) {
        logger.error(messages.apiError('getStats'), error);
        return { success: false, error: 'Failed to retrieve statistics' };
      }
    },

    /**
     * GET /api/health - Get health status
     */
    async getHealth(): Promise<IApiResponse<IHealthStatus>> {
      try {
        const checks = [];

        // Check registry health
        const validation = await services.fileRegistry.validate();
        checks.push({
          name: 'Registry Integrity',
          status: validation.valid ? 'pass' : 'warn',
          message: validation.valid ? 'Registry is healthy' : `Found ${validation.issues.length} issues`,
          details: validation.issues,
        });

        // Check tool installations
        const installations = await services.toolInstallationRegistry.getAllToolInstallations();
        const toolCount = installations.length;
        checks.push({
          name: 'Tool Installations',
          status: toolCount > 0 ? 'pass' : 'warn',
          message: `${toolCount} tool${toolCount === 1 ? '' : 's'} installed`,
        });

        // Determine overall status
        const hasFailure = checks.some((c) => c.status === 'fail');
        const hasWarning = checks.some((c) => c.status === 'warn');
        const overall = hasFailure ? 'unhealthy' : hasWarning ? 'warning' : 'healthy';

        const status: IHealthStatus = {
          overall,
          checks: checks as IHealthStatus['checks'],
          lastCheck: new Date().toISOString(),
        };
        return { success: true, data: status };
      } catch (error) {
        logger.error(messages.apiError('getHealth'), error);
        return { success: false, error: 'Failed to retrieve health status' };
      }
    },

    /**
     * GET /api/config - Get project configuration summary
     */
    async getConfig(): Promise<IApiResponse<IConfigSummary>> {
      try {
        const paths = services.projectConfig.paths;
        const summary: IConfigSummary = {
          dotfilesDir: paths.dotfilesDir,
          generatedDir: paths.generatedDir,
          binariesDir: paths.binariesDir,
          targetDir: paths.targetDir,
          toolConfigsDir: paths.toolConfigsDir,
        };
        return { success: true, data: summary };
      } catch (error) {
        logger.error(messages.apiError('getConfig'), error);
        return { success: false, error: 'Failed to retrieve configuration' };
      }
    },

    /**
     * GET /api/shell - Get shell integration (completions and init scripts)
     */
    async getShellIntegration(): Promise<IApiResponse<IShellIntegration>> {
      try {
        // Get all file operations for completion and init types
        const completionOps = await services.fileRegistry.getOperations({ fileType: 'completion' });
        const initOps = await services.fileRegistry.getOperations({ fileType: 'init' });

        // Group by file path to get latest state
        const completionMap = new Map<string, (typeof completionOps)[0]>();
        for (const op of completionOps) {
          const existing = completionMap.get(op.filePath);
          if (!existing || op.createdAt > existing.createdAt) {
            completionMap.set(op.filePath, op);
          }
        }

        const initMap = new Map<string, (typeof initOps)[0]>();
        for (const op of initOps) {
          const existing = initMap.get(op.filePath);
          if (!existing || op.createdAt > existing.createdAt) {
            initMap.set(op.filePath, op);
          }
        }

        // Filter out deleted files
        const completions = Array.from(completionMap.values())
          .filter((op) => op.operationType !== 'rm')
          .map((op) => ({
            toolName: op.toolName,
            filePath: op.filePath,
            fileType: 'completion' as const,
            lastModified: formatTimestamp(op.createdAt),
          }));

        const initScripts = Array.from(initMap.values())
          .filter((op) => op.operationType !== 'rm')
          .map((op) => ({
            toolName: op.toolName,
            filePath: op.filePath,
            fileType: 'init' as const,
            lastModified: formatTimestamp(op.createdAt),
          }));

        const integration: IShellIntegration = {
          completions,
          initScripts,
          totalFiles: completions.length + initScripts.length,
        };

        return { success: true, data: integration };
      } catch (error) {
        logger.error(messages.apiError('getShellIntegration'), error);
        return { success: false, error: 'Failed to retrieve shell integration' };
      }
    },

    /**
     * GET /api/activity - Get recent activity feed
     */
    async getActivity(limit: number = 20): Promise<IApiResponse<IActivityFeed>> {
      try {
        // Get all operations, sorted by most recent
        const operations = await services.fileRegistry.getOperations();

        // Sort by createdAt descending (most recent first)
        const sorted = operations.toSorted((a, b) => b.createdAt - a.createdAt);

        const totalCount = sorted.length;

        // Map operations to activity items
        const activities = sorted.slice(0, limit).map((op) => ({
          id: op.id,
          toolName: op.toolName,
          action: op.operationType,
          description: `${op.operationType} ${op.fileType}: ${op.filePath}`,
          timestamp: formatTimestamp(op.createdAt),
          relativeTime: formatRelativeTime(op.createdAt),
        }));

        return {
          success: true,
          data: {
            activities,
            totalCount,
          },
        };
      } catch (error) {
        logger.error(messages.apiError('getActivity'), error);
        return { success: false, error: 'Failed to retrieve activity feed' };
      }
    },
  };
}

export type ApiRoutes = ReturnType<typeof createApiRoutes>;
