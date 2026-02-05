import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse, IDashboardStats } from '../../shared/types';
import { formatTimestamp } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';

/**
 * GET /api/stats - Get dashboard statistics
 */
export async function getStats(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<IApiResponse<IDashboardStats>> {
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
}
