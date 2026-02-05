import type { TsLogger } from '@dotfiles/logger';
import type { IToolInstallationRecord } from '@dotfiles/registry/tool';
import type { IApiResponse, IToolDetail } from '../../shared/types';
import { toToolDetail } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getToolConfigs } from './shared';

/**
 * GET /api/tools - List all tools with full details
 * Returns tools from tool configs with runtime state from registry
 */
export async function getTools(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<IApiResponse<IToolDetail[]>> {
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
    const sortedDetails = toolDetails.toSorted((a: typeof toolDetails[0], b: typeof toolDetails[0]) =>
      a.config.name.localeCompare(b.config.name)
    );

    return { success: true, data: sortedDetails };
  } catch (error) {
    logger.error(messages.apiError('getTools'), error);
    return { success: false, error: 'Failed to retrieve tools' };
  }
}
