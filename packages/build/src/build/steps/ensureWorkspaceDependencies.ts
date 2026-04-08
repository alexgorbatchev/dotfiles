import { BuildError } from "../handleBuildError";
import { ensureBunCacheDirectory, shell, throwIfCertificateError } from "../helpers";
import type { IBuildContext } from "../types";

/**
 * Installs workspace dependencies so the build runs with a consistent node_modules state.
 */
export async function ensureWorkspaceDependencies(context: IBuildContext): Promise<void> {
  ensureBunCacheDirectory(context);
  console.log("🔄 Ensuring workspace dependencies...");

  try {
    // stderr("inheritPiped") both prints stderr and captures it so throwIfCertificateError can inspect it.
    // Without it, dax-sh inherits stdio and .stderr.toString() throws "Stdout was not piped".
    const installResult = await shell`bun install --ignore-scripts`.stderr("inheritPiped").noThrow();

    throwIfCertificateError(installResult.stderr.toString());

    if (installResult.code !== 0) {
      throw new BuildError("Workspace dependency installation failed");
    }
  } catch (error) {
    if (error instanceof BuildError) {
      throw error;
    }
    throw new BuildError("Workspace dependency installation failed", error);
  }
}
