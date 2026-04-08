import type { TsLogger } from "@dotfiles/logger";
import type { IActivityFeed, IApiResponse } from "../../shared/types";
import { formatRelativeTime, formatTimestamp } from "../../shared/types";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";

/**
 * GET /api/activity - Get recent activity feed
 */
export async function getActivity(
  logger: TsLogger,
  services: IDashboardServices,
  limit: number = 20,
): Promise<IApiResponse<IActivityFeed>> {
  try {
    // Get all operations, sorted by most recent
    const operations = await services.fileRegistry.getOperations();

    // Sort by createdAt descending (most recent first)
    const sorted = operations.toSorted((a, b) => b.createdAt - a.createdAt);

    const totalCount = sorted.length;

    // Map operations to activity items
    const activities = sorted.slice(0, limit).map((op) => ({
      id: op.id,
      toolName: op.toolName,
      action: op.operationType,
      description: `${op.operationType} ${op.fileType}: ${op.filePath}`,
      timestamp: formatTimestamp(op.createdAt),
      relativeTime: formatRelativeTime(op.createdAt),
    }));

    return {
      success: true,
      data: {
        activities,
        totalCount,
      },
    };
  } catch (error) {
    logger.error(messages.apiError("getActivity"), error);
    return { success: false, error: "Failed to retrieve activity feed" };
  }
}
