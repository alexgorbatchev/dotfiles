import type { TsLogger } from "@dotfiles/logger";
import path from "node:path";
import type { IApiResponse, IHealthStatus } from "../../shared/types";
import { messages } from "../log-messages";
import type { IDashboardServices } from "../types";

/**
 * Finds unused binary version directories in the binaries directory.
 *
 * An unused binary is a version directory that is not currently pointed to by the
 * tool's `current` symlink. Each tool directory in binariesDir contains:
 * - Version folders (e.g., `v1.0.0`, `2025-01-01-120000`)
 * - A `current` symlink pointing to the active version folder
 *
 * @returns Array of paths to unused binary directories
 */
async function findUnusedBinaries(services: IDashboardServices): Promise<string[]> {
  const { fs, projectConfig } = services;
  const binariesDir = projectConfig.paths.binariesDir;
  const unusedBinaries: string[] = [];

  // Check if binaries directory exists
  if (!(await fs.exists(binariesDir))) {
    return [];
  }

  // List all tool directories
  const toolDirs = await fs.readdir(binariesDir);

  for (const toolName of toolDirs) {
    const toolDir = path.join(binariesDir, toolName);

    // Get stats to check if it's a directory
    const toolStat = await fs.stat(toolDir).catch(() => null);
    if (!toolStat?.isDirectory()) {
      continue;
    }

    // List contents of tool directory
    const contents = await fs.readdir(toolDir);

    // Find the current symlink target
    const currentPath = path.join(toolDir, "current");
    let currentTarget: string | null = null;

    if (contents.includes("current")) {
      const currentStat = await fs.lstat(currentPath).catch(() => null);
      if (currentStat?.isSymbolicLink()) {
        const linkTarget = await fs.readlink(currentPath).catch(() => null);
        if (linkTarget) {
          // Resolve relative symlink to absolute path
          currentTarget = path.isAbsolute(linkTarget) ? linkTarget : path.resolve(toolDir, linkTarget);
        }
      }
    }

    // Check each entry in the tool directory
    for (const entry of contents) {
      // Skip the 'current' symlink itself
      if (entry === "current") {
        continue;
      }

      const entryPath = path.join(toolDir, entry);
      const entryStat = await fs.lstat(entryPath).catch(() => null);

      // Only consider directories as potential version folders
      if (!entryStat?.isDirectory()) {
        continue;
      }

      // If this directory is not the current target, it's unused
      if (currentTarget !== entryPath) {
        unusedBinaries.push(entryPath);
      }
    }
  }

  return unusedBinaries;
}

/**
 * GET /api/health - Get health status
 */
export async function getHealth(logger: TsLogger, services: IDashboardServices): Promise<IApiResponse<IHealthStatus>> {
  try {
    const checks = [];

    // Check for unused binaries (first, most actionable)
    const unusedBinaries = await findUnusedBinaries(services);
    const unusedCount = unusedBinaries.length;
    if (unusedCount > 0) {
      checks.push({
        name: "Unused Binaries",
        status: "warn" as const,
        message: "",
        details: unusedBinaries,
      });
    }

    // Check registry health
    const validation = await services.fileRegistry.validate();
    checks.push({
      name: "Registry Integrity",
      status: validation.valid ? "pass" : "warn",
      message: validation.valid ? "Registry is healthy" : `Found ${validation.issues.length} issues`,
      details: validation.issues,
    });

    // Check tool installations
    const installations = await services.toolInstallationRegistry.getAllToolInstallations();
    const toolCount = installations.length;
    checks.push({
      name: "Tool Installations",
      status: toolCount > 0 ? "pass" : "warn",
      message: `${toolCount} tool${toolCount === 1 ? "" : "s"} installed`,
    });

    // Determine overall status
    const hasFailure = checks.some((c) => c.status === "fail");
    const hasWarning = checks.some((c) => c.status === "warn");
    const overall = hasFailure ? "unhealthy" : hasWarning ? "warning" : "healthy";

    const status: IHealthStatus = {
      overall,
      checks: checks as IHealthStatus["checks"],
      lastCheck: new Date().toISOString(),
    };
    return { success: true, data: status };
  } catch (error) {
    logger.error(messages.apiError("getHealth"), error);
    return { success: false, error: "Failed to retrieve health status" };
  }
}
