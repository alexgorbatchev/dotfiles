import { BuildError } from "../handleBuildError";
import type { IBuildContext } from "../types";
import { ensureBunCacheDirectory } from "./ensureBunCacheDirectory";
import { shell } from "./shell";
import { throwIfCertificateError } from "./throwIfCertificateError";

/**
 * Installs dependencies within the output directory for schema bundling and validation.
 *
 * Notes:
 * - This install relies on the temporary workspace files written by `createTempSchemasPackage()`.
 * - Some schema generation steps can still succeed without this install if the root workspace
 *   environment already satisfies type resolution and the bundling tooling skips checks.
 */
export async function installDependenciesInOutputDir(context: IBuildContext): Promise<void> {
  console.log("📥 Installing dependencies in output directory...");
  ensureBunCacheDirectory(context);

  try {
    // stderr("inheritPiped") both prints stderr and captures it so throwIfCertificateError can inspect it.
    // Without it, dax-sh inherits stdio and .stderr.toString() throws "Stdout was not piped".
    const installResult = await shell`cd ${context.paths.outputDir} && bun install --ignore-scripts`
      .stderr("inheritPiped")
      .noThrow();

    throwIfCertificateError(installResult.stderr.toString());

    if (installResult.code !== 0) {
      throw new BuildError("Temporary dependency installation failed");
    }
  } catch (error) {
    if (error instanceof BuildError) {
      throw error;
    }
    throw new BuildError("Temporary dependency installation failed", error);
  }
}
