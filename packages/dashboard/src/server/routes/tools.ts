import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import type { IFileState } from "@dotfiles/registry/file";
import type { IToolInstallationRecord } from "@dotfiles/registry/tool";
import type { IApiResponse, IToolBinaryUsage, IToolDetail, IToolUsageSummary } from "../../shared/types";
import { toToolDetail } from "../../shared/types";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";
import { getToolBinaryDiskSize, getToolConfigs } from "./helpers";

/**
 * Enriches file states with actual file sizes from disk when sizeBytes is missing.
 * This compensates for file operations that weren't tracked with size information.
 */
async function enrichFileSizesFromDisk(files: IFileState[], fs: IFileSystem): Promise<IFileState[]> {
  return Promise.all(
    files.map(async (file) => {
      if (file.sizeBytes !== undefined) {
        return file;
      }

      try {
        const stat = await fs.stat(file.filePath);
        if (stat.isFile()) {
          return { ...file, sizeBytes: stat.size };
        }
      } catch {
        // File doesn't exist or can't be read, return as-is
      }
      return file;
    }),
  );
}

function getConfiguredBinaryNames(config: { binaries?: Array<string | { name: string }> }): string[] {
  if (!config.binaries || config.binaries.length === 0) {
    return [];
  }

  return config.binaries.map((binary) => (typeof binary === "string" ? binary : binary.name));
}

async function getToolUsageSummary(
  services: IDashboardServices,
  toolName: string,
  binaryNames: string[],
): Promise<IToolUsageSummary> {
  const usageByBinary: IToolBinaryUsage[] = await Promise.all(
    binaryNames.map(async (binaryName) => {
      const usage = await services.toolInstallationRegistry.getToolUsage(toolName, binaryName);
      return {
        binaryName,
        count: usage?.usageCount ?? 0,
        lastUsedAt: usage?.lastUsedAt ? usage.lastUsedAt.toISOString() : null,
      };
    }),
  );

  const totalCount = usageByBinary.reduce((sum, item) => sum + item.count, 0);

  return {
    totalCount,
    binaries: usageByBinary,
  };
}

/**
 * GET /api/tools - List all tools with full details
 * Returns tools from tool configs with runtime state from registry
 */
export async function getTools(logger: TsLogger, services: IDashboardServices): Promise<IApiResponse<IToolDetail[]>> {
  try {
    // Load tool configs from .tool.ts files
    const toolConfigs = await getToolConfigs(logger, services);

    // Get installation records and create lookup map
    const installations = await services.toolInstallationRegistry.getAllToolInstallations();
    const installationsMap = new Map<string, IToolInstallationRecord>(installations.map((i) => [i.toolName, i]));

    // Build tool details from configs with runtime state overlay
    const toolDetails = await Promise.all(
      Object.values(toolConfigs).map(async (config) => {
        const files = await services.fileRegistry.getFileStatesForTool(config.name);
        const enrichedFiles = await enrichFileSizesFromDisk(files, services.fs);
        const binaryDiskSize = await getToolBinaryDiskSize(services, config.name);
        const binaryNames = getConfiguredBinaryNames(config);
        const usage = await getToolUsageSummary(services, config.name, binaryNames);
        return toToolDetail(config, installationsMap, enrichedFiles, services.systemInfo, binaryDiskSize, usage);
      }),
    );

    // Sort by name
    const sortedDetails = toolDetails.toSorted((a: (typeof toolDetails)[0], b: (typeof toolDetails)[0]) =>
      a.config.name.localeCompare(b.config.name),
    );

    return { success: true, data: sortedDetails };
  } catch (error) {
    logger.error(messages.apiError("getTools"), error);
    return { success: false, error: "Failed to retrieve tools" };
  }
}
