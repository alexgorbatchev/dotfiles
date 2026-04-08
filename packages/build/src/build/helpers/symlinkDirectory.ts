import fs from "node:fs";

import { BuildError } from "../handleBuildError";

/**
 * Creates or replaces a directory symlink, validating the source path exists.
 */
export function symlinkDirectory(sourcePath: string, destinationPath: string, description: string): void {
  if (!fs.existsSync(sourcePath)) {
    throw new BuildError(`Required path for ${description} not found: ${sourcePath}`);
  }

  fs.rmSync(destinationPath, { recursive: true, force: true });
  fs.symlinkSync(sourcePath, destinationPath, "dir");
}
