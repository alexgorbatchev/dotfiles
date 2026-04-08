import type { TsLogger } from "@dotfiles/logger";
import type { IApiResponse, IShellIntegration } from "../../shared/types";
import { formatTimestamp } from "../../shared/dashboardUtils";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";

/**
 * GET /api/shell - Get shell integration (completions and init scripts)
 */
export async function getShellIntegration(
  logger: TsLogger,
  services: IDashboardServices,
): Promise<IApiResponse<IShellIntegration>> {
  try {
    // Get all file operations for completion and init types
    const completionOps = await services.fileRegistry.getOperations({ fileType: "completion" });
    const initOps = await services.fileRegistry.getOperations({ fileType: "init" });

    // Group by file path to get latest state
    const completionMap = new Map<string, (typeof completionOps)[0]>();
    for (const op of completionOps) {
      const existing = completionMap.get(op.filePath);
      if (!existing || op.createdAt > existing.createdAt) {
        completionMap.set(op.filePath, op);
      }
    }

    const initMap = new Map<string, (typeof initOps)[0]>();
    for (const op of initOps) {
      const existing = initMap.get(op.filePath);
      if (!existing || op.createdAt > existing.createdAt) {
        initMap.set(op.filePath, op);
      }
    }

    // Filter out deleted files
    const completions = Array.from(completionMap.values())
      .filter((op) => op.operationType !== "rm")
      .map((op) => ({
        toolName: op.toolName,
        filePath: op.filePath,
        fileType: "completion" as const,
        lastModified: formatTimestamp(op.createdAt),
      }));

    const initScripts = Array.from(initMap.values())
      .filter((op) => op.operationType !== "rm")
      .map((op) => ({
        toolName: op.toolName,
        filePath: op.filePath,
        fileType: "init" as const,
        lastModified: formatTimestamp(op.createdAt),
      }));

    const integration: IShellIntegration = {
      completions,
      initScripts,
      totalFiles: completions.length + initScripts.length,
    };

    return { success: true, data: integration };
  } catch (error) {
    logger.error(messages.apiError("getShellIntegration"), error);
    return { success: false, error: "Failed to retrieve shell integration" };
  }
}
