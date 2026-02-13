import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse, IInstallToolRequest, IInstallToolResponse } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getToolConfigs } from './helpers';

/**
 * POST /api/tools/:name/install - Install or reinstall a tool
 */
export async function installTool(
  logger: TsLogger,
  services: IDashboardServices,
  toolName: string,
  request: IInstallToolRequest,
): Promise<IApiResponse<IInstallToolResponse>> {
  const subLogger = logger.getSubLogger({ name: 'installTool', context: toolName });

  try {
    // Load tool config
    const toolConfigs = await getToolConfigs(logger, services);
    const toolConfig = toolConfigs[toolName];

    if (!toolConfig) {
      return { success: false, error: `Tool "${toolName}" not found in configuration` };
    }

    // Install the tool
    const result = await services.installer.install(toolName, toolConfig, {
      force: request.force ?? false,
    });

    if (!result.success) {
      subLogger.error(messages.installFailed(result.error ?? 'Unknown error'));
      return {
        success: true,
        data: {
          installed: false,
          error: result.error ?? 'Installation failed',
        },
      };
    }

    subLogger.info(messages.installSucceeded());
    return {
      success: true,
      data: {
        installed: true,
        version: result.version,
        alreadyInstalled: result.installationMethod === 'already-installed',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    subLogger.error(messages.installFailed(errorMessage), error);
    return { success: false, error: `Failed to install tool: ${errorMessage}` };
  }
}
