import path from "node:path";
import type { IDashboardServices } from "../../types";

/**
 * Calculates the total size of a directory recursively.
 */
export async function getDirectorySize(services: IDashboardServices, dirPath: string): Promise<number> {
  const fs = services.fs;
  let totalSize = 0;

  try {
    if (!(await fs.exists(dirPath))) {
      return 0;
    }

    const entries = await fs.readdir(dirPath);
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);
      const stat = await fs.stat(entryPath);

      if (stat.isDirectory()) {
        totalSize += await getDirectorySize(services, entryPath);
      } else if (stat.isFile()) {
        totalSize += stat.size;
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }

  return totalSize;
}

/**
 * Gets the binary disk size for a specific tool.
 */
export async function getToolBinaryDiskSize(services: IDashboardServices, toolName: string): Promise<number> {
  const binariesDir = path.join(services.projectConfig.paths.generatedDir, "binaries");
  const toolBinaryDir = path.join(binariesDir, toolName);
  return getDirectorySize(services, toolBinaryDir);
}
