import path from "node:path";
import tailwindPlugin from "bun-plugin-tailwind";
import { BuildError } from "../handleBuildError";
import type { IBuildContext } from "../types";

/**
 * Builds the dashboard React frontend client into Go's embedded assets folder (pkg/dashboard/dist/).
 */
export async function buildDashboard(context: IBuildContext): Promise<void> {
  console.log("🏗️  Building Dashboard Client...");

  try {
    const entryPath = path.join(context.paths.rootDir, "packages/dashboard/src/client/dashboard.html");
    const outDir = path.join(context.paths.rootDir, "pkg/dashboard/dist");

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir: outDir,
      naming: {
        entry: "index.html",
        chunk: "[name]-[hash].[ext]",
        asset: "[name]-[hash].[ext]",
      },
      minify: true,
      target: "browser",
      plugins: [tailwindPlugin],
      jsx: {
        runtime: "automatic",
        importSource: "preact",
      },
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });

    if (!result.success) {
      console.error("❌ Dashboard build failed:");
      for (const log of result.logs) {
        console.error(`   ${log.toString()}`);
      }
      throw new BuildError("Dashboard bundling failed");
    }

    console.log("✅ Dashboard Client compiled and bundled to pkg/dashboard/dist/");
  } catch (error) {
    throw new BuildError("Dashboard bundling failed", error);
  }
}
