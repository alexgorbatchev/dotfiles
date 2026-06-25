import { shell } from "../helpers";
import { BuildError } from "../handleBuildError";
import type { IBuildContext } from "../types";

/**
 * Compiles the final, statically-linked standalone Go executable.
 */
export async function buildGoBinary(context: IBuildContext): Promise<void> {
  console.log("📦 Compiling Go Standalone Binary...");
  const binaryPath = context.paths.compiledBinaryOutputFile;

  try {
    const buildResult = await shell`go build -ldflags="-s -w" -o ${binaryPath} ./cmd/dotfiles`
      .noThrow()
      .cwd(context.paths.rootDir);

    if (buildResult.code !== 0) {
      console.error(buildResult.stderr.toString());
      throw new BuildError(`Go compilation failed with exit code ${buildResult.code}`);
    }

    console.log(`✅ Statically compiled Go binary successfully at: ${binaryPath}`);
  } catch (error) {
    throw new BuildError("Go compilation failed", error);
  }
}
