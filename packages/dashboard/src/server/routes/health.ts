import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse, IHealthStatus } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';

/**
 * GET /api/health - Get health status
 */
export async function getHealth(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<IApiResponse<IHealthStatus>> {
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
}
