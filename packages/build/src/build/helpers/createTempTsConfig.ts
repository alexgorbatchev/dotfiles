import type { IBuildContext } from '../types';

/**
 * Writes a temporary tsconfig used to emit schema declaration files.
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
      types: ['bun', 'node'],
      paths: {
        '@dotfiles/*': [
          `${context.paths.rootDir}/packages/*/src/index.ts`,
          `${context.paths.rootDir}/packages/*/index.ts`,
        ],
      },
    },
    include: [`${context.paths.rootDir}/packages/cli/src/schema-exports.ts`],
  };

  await Bun.write(context.paths.buildTsconfigPath, JSON.stringify(tempTsConfig, null, 2));
}
