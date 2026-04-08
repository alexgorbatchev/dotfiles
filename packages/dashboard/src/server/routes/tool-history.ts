import type { TsLogger } from "@dotfiles/logger";
import type { IApiResponse, IToolHistory } from "../../shared/types";
import { formatRelativeTime, formatTimestamp } from "../../shared/types";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";

/**
 * GET /api/tools/:name/history - Get file operation history for a tool
 */
export async function getToolHistory(
  logger: TsLogger,
  services: IDashboardServices,
  toolName: string,
): Promise<IApiResponse<IToolHistory>> {
  try {
    // Get operations for this tool
    const operations = await services.fileRegistry.getOperations({ toolName });

    // Sort by createdAt descending (most recent first)
    const sorted = operations.toSorted((a, b) => b.createdAt - a.createdAt);

    // Get installation record for installedAt
    const installation = await services.toolInstallationRegistry.getToolInstallation(toolName);

    const entries = sorted.map((op) => ({
      id: op.id,
      operationType: op.operationType,
      fileType: op.fileType,
      filePath: op.filePath,
      timestamp: formatTimestamp(op.createdAt),
      relativeTime: formatRelativeTime(op.createdAt),
    }));

    return {
      success: true,
      data: {
        entries,
        totalCount: entries.length,
        installedAt: installation?.installedAt.toISOString() ?? null,
        dotfilesDir: services.projectConfig.paths.dotfilesDir,
      },
    };
  } catch (error) {
    logger.error(messages.apiError("getToolHistory"), error);
    return { success: false, error: "Failed to retrieve tool history" };
  }
}
