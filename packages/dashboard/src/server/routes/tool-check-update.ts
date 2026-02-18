import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse, ICheckUpdateResponse } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getToolConfigs } from './helpers';

/**
 * POST /api/tools/:name/check-update - Check for available updates
 */
export async function checkToolUpdate(
  logger: TsLogger,
  services: IDashboardServices,
  toolName: string,
): Promise<IApiResponse<ICheckUpdateResponse>> {
  const subLogger = logger.getSubLogger({ name: 'checkToolUpdate', context: toolName });

  try {
    const toolConfigs = await getToolConfigs(logger, services);
    const toolConfig = toolConfigs[toolName];

    if (!toolConfig) {
      return { success: false, error: `Tool "${toolName}" not found in configuration` };
    }

    const plugin = services.pluginRegistry.get(toolConfig.installationMethod);

    if (!plugin || !plugin.supportsUpdateCheck || !plugin.supportsUpdateCheck()) {
      return {
        success: true,
        data: {
          hasUpdate: false,
          currentVersion: toolConfig.version || 'unknown',
          latestVersion: 'unknown',
          supported: false,
          error: `Update checking is not supported for installation method "${toolConfig.installationMethod}"`,
        },
      };
    }

    const updateCheckResult = await plugin.checkUpdate?.(
      toolName,
      toolConfig,
      {} as Parameters<NonNullable<typeof plugin.checkUpdate>>[2],
      subLogger,
    );

    if (!updateCheckResult) {
      return {
        success: true,
        data: {
          hasUpdate: false,
          currentVersion: toolConfig.version || 'unknown',
          latestVersion: 'unknown',
          supported: false,
          error: 'Update check returned no result',
        },
      };
    }

    if (!updateCheckResult.success) {
      return {
        success: true,
        data: {
          hasUpdate: false,
          currentVersion: toolConfig.version || 'unknown',
          latestVersion: 'unknown',
          supported: true,
          error: updateCheckResult.error,
        },
      };
    }

    subLogger.info(messages.checkUpdateCompleted(
      updateCheckResult.hasUpdate,
      updateCheckResult.currentVersion ?? 'unknown',
      updateCheckResult.latestVersion ?? 'unknown',
    ));

    return {
      success: true,
      data: {
        hasUpdate: updateCheckResult.hasUpdate,
        currentVersion: updateCheckResult.currentVersion ?? toolConfig.version ?? 'unknown',
        latestVersion: updateCheckResult.latestVersion ?? 'unknown',
        supported: true,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    subLogger.error(messages.checkUpdateFailed(errorMessage), error);
    return { success: false, error: `Failed to check for updates: ${errorMessage}` };
  }
}
