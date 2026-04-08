import type { ToolConfig } from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";
import type { IDashboardServices, ToolConfigsCache } from "../../types";

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
