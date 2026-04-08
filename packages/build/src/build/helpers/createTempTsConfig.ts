import type { IBuildContext } from "../types";

/**
 * Writes a temporary tsconfig used to emit schema declaration files.
 * This tsconfig is used by tsgo for initial declaration emit.
 */
export async function createTempTsConfig(context: IBuildContext): Promise<void> {
  const tempTsConfig: Record<string, unknown> = {
    extends: `${context.paths.rootDir}/tsconfig.json`,
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: context.paths.tempSchemasBuildDir,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      noImplicitAny: false,
      // Empty types array - tsgo generates .d.ts successfully, and dts-bundle-generator
      // doesn't need bun/node types for bundling the schema declarations
      types: [],
      paths: {
        "@dotfiles/*": [
          `${context.paths.rootDir}/packages/*/src/index.ts`,
          `${context.paths.rootDir}/packages/*/index.ts`,
        ],
      },
    },
    include: [`${context.paths.rootDir}/packages/cli/src/schema-exports.ts`],
  };

  await Bun.write(context.paths.buildTsconfigPath, JSON.stringify(tempTsConfig, null, 2));
}

/**
 * Writes a tsconfig for dts-bundle-generator that points to the generated .d.ts files.
 * This must be called AFTER tsgo has generated the declaration files.
 */
export async function createDtsBundlerTsConfig(context: IBuildContext): Promise<string> {
  const dtsBundlerConfigPath: string = `${context.paths.outputDir}/tsconfig--dts-bundler.json`;

  const dtsBundlerConfig: Record<string, unknown> = {
    // Extend from root tsconfig for proper lib/type settings
    extends: `${context.paths.rootDir}/tsconfig.json`,
    compilerOptions: {
      baseUrl: context.paths.tempSchemasBuildDir,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      noEmit: true,
      // Point to generated .d.ts files, not source .ts files
      paths: {
        "@dotfiles/*": [
          `${context.paths.tempSchemasBuildDir}/*/src/index.d.ts`,
          `${context.paths.tempSchemasBuildDir}/*/index.d.ts`,
        ],
      },
    },
    // Include all generated declaration files
    include: [`${context.paths.tempSchemasBuildDir}/**/*.d.ts`],
  };

  await Bun.write(dtsBundlerConfigPath, JSON.stringify(dtsBundlerConfig, null, 2));
  return dtsBundlerConfigPath;
}
