import type { TsLogger } from "@dotfiles/logger";
import type { IApiResponse, IConfigSummary } from "../../shared/types";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";

/**
 * GET /api/config - Get project configuration summary
 */
export async function getConfig(logger: TsLogger, services: IDashboardServices): Promise<IApiResponse<IConfigSummary>> {
  try {
    const paths = services.projectConfig.paths;
    const summary: IConfigSummary = {
      dotfilesDir: paths.dotfilesDir,
      generatedDir: paths.generatedDir,
      binariesDir: paths.binariesDir,
      targetDir: paths.targetDir,
      toolConfigsDir: paths.toolConfigsDir,
    };
    return { success: true, data: summary };
  } catch (error) {
    logger.error(messages.apiError("getConfig"), error);
    return { success: false, error: "Failed to retrieve configuration" };
  }
}
