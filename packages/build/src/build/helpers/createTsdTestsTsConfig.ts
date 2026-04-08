import type { IBuildContext } from "../types";

/**
 * Writes the tsconfig.json used by the temporary tsd tests project.
 * Includes .generated/tool-types.d.ts to mimic actual end user setup.
 */
export async function createTsdTestsTsConfig(context: IBuildContext): Promise<void> {
  const compilerOptions: Record<string, unknown> = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ["ES2022"],
  };

  const tsConfig: Record<string, unknown> = {
    compilerOptions,
    include: ["./**/*.d.ts", ".generated/tool-types.d.ts"],
  };

  await Bun.write(context.paths.tsdTestsConfigPath, JSON.stringify(tsConfig, null, 2));
}
