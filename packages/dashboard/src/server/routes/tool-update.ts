import type { TsLogger } from "@dotfiles/logger";
import type { IApiResponse, IUpdateToolResponse } from "../../shared/types";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";
import { getToolConfigs } from "./helpers";

/**
 * POST /api/tools/:name/update - Update a tool to the latest version
 */
export async function updateTool(
  logger: TsLogger,
  services: IDashboardServices,
  toolName: string,
): Promise<IApiResponse<IUpdateToolResponse>> {
  const subLogger = logger.getSubLogger({ name: "updateTool", context: toolName });

  try {
    const toolConfigs = await getToolConfigs(logger, services);
    const toolConfig = toolConfigs[toolName];

    if (!toolConfig) {
      return { success: false, error: `Tool "${toolName}" not found in configuration` };
    }

    if (toolConfig.version !== "latest") {
      return {
        success: true,
        data: {
          updated: false,
          supported: false,
          error: `Tool is pinned to version "${toolConfig.version}". Only tools with version "latest" can be updated.`,
        },
      };
    }

    const plugin = services.pluginRegistry.get(toolConfig.installationMethod);

    if (!plugin || !plugin.supportsUpdate()) {
      subLogger.warn(messages.updateNotSupported(toolConfig.installationMethod));
    }

    const existingInstallation = await services.toolInstallationRegistry.getToolInstallation(toolName);
    const oldVersion = existingInstallation?.version ?? "unknown";

    const installResult = await services.installer.install(toolName, toolConfig, { force: true });

    if (!installResult.success) {
      subLogger.error(messages.updateFailed(installResult.error ?? "Unknown error"));
      return {
        success: true,
        data: {
          updated: false,
          supported: true,
          error: installResult.error ?? "Update failed",
        },
      };
    }

    const newVersion =
      "version" in installResult && typeof installResult.version === "string" ? installResult.version : "unknown";

    subLogger.info(messages.updateSucceeded(oldVersion, newVersion));

    return {
      success: true,
      data: {
        updated: true,
        oldVersion,
        newVersion,
        supported: true,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    subLogger.error(messages.updateFailed(errorMessage), error);
    return { success: false, error: `Failed to update tool: ${errorMessage}` };
  }
}
