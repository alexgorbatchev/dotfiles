import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse, IRecentTools } from '../../shared/types';
import { formatRelativeTime, formatTimestamp } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getGitFirstCommitDate } from './shared';

/**
 * GET /api/recent-tools - Get recently added tool config files
 * Returns the 10 most recently created .tool.ts files.
 * Uses git commit date when available, falls back to filesystem mtime.
 */
export async function getRecentTools(
  logger: TsLogger,
  services: IDashboardServices,
  limit: number = 10,
): Promise<IApiResponse<IRecentTools>> {
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
}
