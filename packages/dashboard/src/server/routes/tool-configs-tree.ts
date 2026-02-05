import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse, IToolConfigsTree } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getToolConfigs } from './shared';

/**
 * GET /api/tool-configs-tree - Get file tree of tool configs directory
 */
export async function getToolConfigsTree(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<IApiResponse<IToolConfigsTree>> {
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
    async function buildTree(dirPath: string) {
      interface IFileTreeEntry {
        name: string;
        path: string;
        type: 'file' | 'directory';
        children?: IFileTreeEntry[];
        toolName?: string;
      }

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
}
