import fs from "node:fs";
import { BuildError } from "../handleBuildError";
import type { IBuildContext } from "../types";

/**
 * Ensures the compiled Go binary stays under the configured size budget.
 */
export function enforceGoBinarySizeLimit(context: IBuildContext): void {
  const binaryPath = context.paths.compiledBinaryOutputFile;

  if (!fs.existsSync(binaryPath)) {
    throw new BuildError("dotfiles output is missing");
  }

  const stats = fs.statSync(binaryPath);
  if (!stats.isFile()) {
    throw new BuildError("dotfiles output is missing");
  }

  if (stats.size <= context.constants.maxGoBinarySizeBytes) {
    return;
  }

  const sizeKb: number = Math.ceil(stats.size / 1024);
  throw new BuildError(
    `dotfiles binary is too large (${sizeKb} kb), expected under ${context.constants.maxGoBinarySizeKb} kb`,
  );
}
