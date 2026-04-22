import tailwindPlugin from "bun-plugin-tailwind";
import fs from "node:fs";
import { BuildError } from "../handleBuildError";
import type { IBuildContext } from "../types";

/**
 * Builds a standalone Bun executable alongside the npm package output.
 */
export async function buildCompiledBinary(context: IBuildContext): Promise<void> {
  console.log("📦 Building standalone binary...");
  console.log(`📍 Entry: ${context.paths.entryPoint}`);
  console.log(`📦 Output: ${context.paths.compiledBinaryOutputFile}`);

  let result: Bun.BuildOutput;

  const compiledAuthoringTypes = fs.readFileSync(context.paths.outputAuthoringTypesDtsPath, "utf8");

  try {
    result = await Bun.build({
      entrypoints: [context.paths.entryPoint],
      compile: {
        outfile: context.paths.compiledBinaryOutputFile,
      },
      minify: true,
      target: "bun",
      format: "esm",
      plugins: [tailwindPlugin],
      jsx: {
        runtime: "automatic",
        importSource: "preact",
      },
      define: {
        DOTFILES_COMPILED_AUTHORING_TYPES: JSON.stringify(compiledAuthoringTypes),
        DOTFILES_VERSION: JSON.stringify(process.env.DOTFILES_VERSION ?? "0.0.0"),
        "import.meta.main": "true",
        "process.env.NODE_ENV": '"production"',
      },
      env: "inline",
    });
  } catch (error) {
    console.error("❌ Compiled binary build threw an exception:");
    console.error(error);
    throw new BuildError("Compiled binary build failed");
  }

  if (!result.success) {
    console.error("❌ Compiled binary build failed:");
    for (const message of result.logs) {
      console.error(`   ${message.toString()}`);
    }
    throw new BuildError("Compiled binary build failed");
  }

  fs.chmodSync(context.paths.compiledBinaryOutputFile, 0o755);

  const outputStats = fs.statSync(context.paths.compiledBinaryOutputFile);
  if (!outputStats.isFile()) {
    throw new BuildError("Compiled binary output is missing");
  }
}
