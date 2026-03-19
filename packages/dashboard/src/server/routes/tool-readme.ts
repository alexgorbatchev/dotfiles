import { NotFoundError } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import type { IApiResponse } from '../../shared/types';
import { messages } from '../log-messages';
import type { IDashboardServices } from '../types';
import { getToolConfigs } from './helpers';

interface IPlatformConfigLike {
  config?: {
    installParams?: Record<string, unknown>;
  };
}

interface IToolConfigLike {
  installParams?: Record<string, unknown>;
  platformConfigs?: IPlatformConfigLike[];
}

function getRepoFromInstallParams(installParams: Record<string, unknown> | undefined): string | null {
  if (!installParams) {
    return null;
  }

  const repo = installParams['repo'];
  return typeof repo === 'string' ? repo : null;
}

function getRepoFromToolConfig(config: IToolConfigLike): string | null {
  const topLevelRepo = getRepoFromInstallParams(config.installParams);
  if (topLevelRepo) {
    return topLevelRepo;
  }

  for (const entry of config.platformConfigs ?? []) {
    const repo = getRepoFromInstallParams(entry.config?.installParams);
    if (repo) {
      return repo;
    }
  }

  return null;
}

/**
 * GET /api/tools/:name/readme - Get README content for a tool
 * Fetches README from GitHub raw URL if tool has a repo configured.
 * Uses the downloader service which has caching enabled.
 */
export async function getToolReadme(
  logger: TsLogger,
  services: IDashboardServices,
  toolName: string,
): Promise<IApiResponse<{ content: string; }>> {
  try {
    const toolConfigs = await getToolConfigs(logger, services);
    const config = toolConfigs[toolName];

    if (!config) {
      return { success: false, error: 'Tool not found' };
    }

    const repo = getRepoFromToolConfig(config);

    if (!repo) {
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
}
