import type { ToolConfig } from '@dotfiles/core';
import { NotFoundError } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import type { IToolInstallationRecord } from '@dotfiles/registry/tool';
import type {
  IActivityFeed,
  IApiResponse,
  IConfigSummary,
  IDashboardStats,
  IFileTreeEntry,
  IHealthStatus,
  IRecentTools,
  IShellIntegration,
  IToolConfigsTree,
  IToolDetail,
  IToolHistory,
} from '../shared/types';
import { formatRelativeTime, formatTimestamp, toToolDetail } from '../shared/types';
import { messages } from './log-messages';
import type { IDashboardServices, ToolConfigsCache } from './types';

/** Cache for loaded tool configs to avoid re-parsing on every request */
let toolConfigsCache: ToolConfigsCache | null = null;

/**
 * Clear the tool configs cache. Used for testing.
 */
export function clearToolConfigsCache(): void {
  toolConfigsCache = null;
}

/**
 * Get the date when a file was first committed to git.
 * Returns null if the file is not tracked by git.
 */
async function getGitFirstCommitDate(filePath: string): Promise<Date | null> {
  try {
    const proc = Bun.spawn(['git', 'log', '--diff-filter=A', '--format=%aI', '--', filePath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output.trim()) {
      return null;
    }

    // Take the first line (should be the only one for --diff-filter=A)
    const dateStr = output.trim().split('\n')[0];
    if (!dateStr) {
      return null;
    }

    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Load tool configs, using cache if available.
 */
async function getToolConfigs(logger: TsLogger, services: IDashboardServices): Promise<Record<string, ToolConfig>> {
  if (toolConfigsCache) {
    return toolConfigsCache;
  }

  const { projectConfig, fs, configService, systemInfo } = services;

  toolConfigsCache = await configService.loadToolConfigs(
    logger,
    projectConfig.paths.toolConfigsDir,
    fs,
    projectConfig,
    systemInfo,
  );

  return toolConfigsCache;
}

/**
 * Creates API route handlers for the dashboard.
 */
export function createApiRoutes(parentLogger: TsLogger, services: IDashboardServices) {
  const logger = parentLogger.getSubLogger({ name: 'api' });

  return {
    /**
     * GET /api/tools - List all tools with full details
     * Returns tools from tool configs with runtime state from registry
     */
    async getTools(): Promise<IApiResponse<IToolDetail[]>> {
      try {
        // Load tool configs from .tool.ts files
        const toolConfigs = await getToolConfigs(logger, services);

        // Get installation records and create lookup map
        const installations = await services.toolInstallationRegistry.getAllToolInstallations();
        const installationsMap = new Map<string, IToolInstallationRecord>(
          installations.map((i) => [i.toolName, i]),
        );

        // Build tool details from configs with runtime state overlay
        const toolDetails = await Promise.all(
          Object.values(toolConfigs).map(async (config) => {
            const files = await services.fileRegistry.getFileStatesForTool(config.name);
            return toToolDetail(config, installationsMap, files, services.systemInfo);
          }),
        );

        // Sort by name
        const sortedDetails = toolDetails.toSorted((a, b) => a.config.name.localeCompare(b.config.name));

        return { success: true, data: sortedDetails };
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
     * GET /api/tool-configs-tree - Get file tree of tool configs directory
     */
    async getToolConfigsTree(): Promise<IApiResponse<IToolConfigsTree>> {
      try {
        const toolConfigsDir = services.projectConfig.paths.toolConfigsDir;
        const toolConfigs = await getToolConfigs(logger, services);

        // Build a map from config file path to tool name
        const configPathToTool = new Map<string, string>();
        for (const config of Object.values(toolConfigs)) {
          if (config.configFilePath) {
            configPathToTool.set(config.configFilePath, config.name);
          }
        }

        // Recursively build file tree
        async function buildTree(dirPath: string): Promise<IFileTreeEntry[]> {
          const entries: IFileTreeEntry[] = [];
          const itemNames = await services.fs.readdir(dirPath);

          for (const name of itemNames) {
            const fullPath = `${dirPath}/${name}`;
            const stat = await services.fs.stat(fullPath);

            if (stat.isDirectory()) {
              const children = await buildTree(fullPath);
              // Only include non-empty directories
              if (children.length > 0) {
                entries.push({
                  name,
                  path: fullPath,
                  type: 'directory',
                  children,
                });
              }
            } else if (name.endsWith('.tool.ts')) {
              entries.push({
                name,
                path: fullPath,
                type: 'file',
                toolName: configPathToTool.get(fullPath),
              });
            }
          }

          // Sort: directories first, then files, alphabetically
          return entries.toSorted((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });
        }

        const entries = await buildTree(toolConfigsDir);

        return {
          success: true,
          data: {
            rootPath: toolConfigsDir,
            entries,
          },
        };
      } catch (error) {
        logger.error(messages.apiError('getToolConfigsTree'), error);
        return { success: false, error: 'Failed to retrieve tool configs tree' };
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

    /**
     * GET /api/tools/:name/history - Get file operation history for a tool
     */
    async getToolHistory(toolName: string): Promise<IApiResponse<IToolHistory>> {
      try {
        // Get operations for this tool
        const operations = await services.fileRegistry.getOperations({ toolName });

        // Sort by createdAt descending (most recent first)
        const sorted = operations.toSorted((a, b) => b.createdAt - a.createdAt);

        // Get installation record for installedAt
        const installation = await services.toolInstallationRegistry.getToolInstallation(toolName);

        const entries = sorted.map((op) => ({
          id: op.id,
          operationType: op.operationType,
          fileType: op.fileType,
          filePath: op.filePath,
          timestamp: formatTimestamp(op.createdAt),
          relativeTime: formatRelativeTime(op.createdAt),
        }));

        return {
          success: true,
          data: {
            entries,
            totalCount: entries.length,
            installedAt: installation?.installedAt.toISOString() ?? null,
            dotfilesDir: services.projectConfig.paths.dotfilesDir,
          },
        };
      } catch (error) {
        logger.error(messages.apiError('getToolHistory'), error);
        return { success: false, error: 'Failed to retrieve tool history' };
      }
    },

    /**
     * GET /api/tools/:name/readme - Get README content for a tool
     * Fetches README from GitHub raw URL if tool has a repo configured.
     * Uses the downloader service which has caching enabled.
     */
    async getToolReadme(toolName: string): Promise<IApiResponse<{ content: string; }>> {
      try {
        const toolConfigs = await getToolConfigs(logger, services);
        const config = toolConfigs[toolName];

        if (!config) {
          return { success: false, error: 'Tool not found' };
        }

        const installParams = config.installParams as Record<string, unknown>;
        const repo = installParams['repo'];

        if (typeof repo !== 'string') {
          return { success: false, error: 'Tool does not have a GitHub repository' };
        }

        // Try version first if specified, then common default branches
        const branchesToTry = config.version
          ? [config.version, 'main', 'master']
          : ['main', 'master'];

        for (const branch of branchesToTry) {
          const url = `https://raw.githubusercontent.com/${repo}/${branch}/README.md`;
          try {
            const response = await services.downloader.download(logger, url);

            if (response) {
              const content = response.toString('utf-8');
              return { success: true, data: { content } };
            }
          } catch (error) {
            // NotFoundError means this branch doesn't have a README, try next branch
            if (error instanceof NotFoundError) {
              continue;
            }
            throw error;
          }
        }

        return { success: false, error: 'README not found' };
      } catch (error) {
        logger.error(messages.apiError('getToolReadme'), error);
        return { success: false, error: 'Failed to retrieve README' };
      }
    },

    /**
     * GET /api/recent-tools - Get recently added tool config files
     * Returns the 10 most recently created .tool.ts files.
     * Uses git commit date when available, falls back to filesystem mtime.
     */
    async getRecentTools(limit: number = 10): Promise<IApiResponse<IRecentTools>> {
      try {
        const toolConfigsDir = services.projectConfig.paths.toolConfigsDir;

        // Collect all .tool.ts files
        const toolFiles: Array<{ name: string; configFilePath: string; }> = [];

        async function collectToolFiles(dirPath: string): Promise<void> {
          const itemNames = await services.fs.readdir(dirPath);

          for (const name of itemNames) {
            const fullPath = `${dirPath}/${name}`;
            const stat = await services.fs.stat(fullPath);

            if (stat.isDirectory()) {
              await collectToolFiles(fullPath);
            } else if (name.endsWith('.tool.ts')) {
              const toolName = name.replace(/\.tool\.ts$/, '');
              toolFiles.push({
                name: toolName,
                configFilePath: fullPath,
              });
            }
          }
        }

        await collectToolFiles(toolConfigsDir);

        // Get timestamps for all files (git or mtime)
        const toolsWithTimestamps = await Promise.all(
          toolFiles.map(async (file) => {
            const gitDate = await getGitFirstCommitDate(file.configFilePath);
            if (gitDate) {
              return {
                name: file.name,
                configFilePath: file.configFilePath,
                timestamp: gitDate.getTime(),
                source: 'git' as const,
              };
            }
            const stat = await services.fs.stat(file.configFilePath);
            return {
              name: file.name,
              configFilePath: file.configFilePath,
              timestamp: stat.mtimeMs,
              source: 'mtime' as const,
            };
          }),
        );

        // Sort by timestamp descending (most recent first) and take top N
        const recentFiles = toolsWithTimestamps
          .toSorted((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);

        const tools = recentFiles.map((file) => ({
          name: file.name,
          configFilePath: file.configFilePath,
          createdAt: formatTimestamp(file.timestamp),
          relativeTime: formatRelativeTime(file.timestamp),
          timestampSource: file.source,
        }));

        return {
          success: true,
          data: { tools },
        };
      } catch (error) {
        logger.error(messages.apiError('getRecentTools'), error);
        return { success: false, error: 'Failed to retrieve recent tools' };
      }
    },
  };
}

export type ApiRoutes = ReturnType<typeof createApiRoutes>;
