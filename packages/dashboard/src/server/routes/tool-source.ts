import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getToolConfigs } from './shared';

/**
 * GET /api/tools/:name/source - Get tool configuration source code
 * Returns the raw TypeScript source of the .tool.ts file.
 */
export async function getToolSource(
  logger: TsLogger,
  services: IDashboardServices,
  toolName: string,
): Promise<IApiResponse<{ content: string; filePath: string; }>> {
  try {
    const toolConfigs = await getToolConfigs(logger, services);
    const config = toolConfigs[toolName];

    if (!config) {
      return { success: false, error: 'Tool not found' };
    }

    const configFilePath = config.configFilePath;
    if (!configFilePath) {
      return { success: false, error: 'Tool configuration file path not available' };
    }

    const content = await services.fs.readFile(configFilePath, 'utf-8');
    return { success: true, data: { content, filePath: configFilePath } };
  } catch (error) {
    logger.error(messages.apiError('getToolSource'), error);
    return { success: false, error: 'Failed to retrieve tool source' };
  }
}
