import type { ToolConfig } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import type { IDashboardServices, ToolConfigsCache } from '../types';

/** Cache for loaded tool configs to avoid re-parsing on every request */
let toolConfigsCache: ToolConfigsCache | null = null;

/**
 * Clear the tool configs cache. Used for testing.
 */
export function clearToolConfigsCache(): void {
  toolConfigsCache = null;
}

/**
 * Load tool configs, using cache if available.
 */
export async function getToolConfigs(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<Record<string, ToolConfig>> {
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
 * Get the date when a file was first committed to git.
 * Returns null if the file is not tracked by git.
 */
export async function getGitFirstCommitDate(filePath: string): Promise<Date | null> {
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
