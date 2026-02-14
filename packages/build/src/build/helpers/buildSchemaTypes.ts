import { $ } from 'dax-sh';
import path from 'node:path';

import type { IBuildContext, IDependencyVersions } from '../types';
import { copyPackagesToOutputDir } from './copyPackagesToOutputDir';
import { createTempSchemasPackage } from './createTempSchemasPackage';
import { createDtsBundlerTsConfig, createTempTsConfig } from './createTempTsConfig';
import { installDependenciesInOutputDir } from './installDependenciesInOutputDir';
import { resolveSchemaExportsDtsPath } from './resolveSchemaExportsDtsPath';

/**
 * Returns path to dts-bundle-generator binary.
 * Using direct path avoids network resolution issues with `bun x`.
 */
function getDtsBundleGeneratorPath(rootDir: string): string {
  return path.join(rootDir, 'node_modules/dts-bundle-generator/dist/bin/dts-bundle-generator.js');
}

/**
 * Builds the bundled schema declarations file used in the published output.
 *
 * Notes:
 * - Declaration emit (`tsgo`) happens first and can use the root workspace environment.
 * - A temporary workspace is created and installed in the output directory to make subsequent
 *   bundling/validation steps deterministic.
 * - dts-bundle-generator uses a separate tsconfig that points to generated .d.ts files.
 */
export async function buildSchemaTypes(context: IBuildContext, dependencyVersions: IDependencyVersions): Promise<void> {
  await createTempTsConfig(context);
  await $`bun tsgo --project ${context.paths.buildTsconfigPath}`;

  copyPackagesToOutputDir(context);
  await createTempSchemasPackage(context, dependencyVersions);
  await installDependenciesInOutputDir(context);

  const schemaExportsPath: string = resolveSchemaExportsDtsPath(context.paths.tempSchemasBuildDir);
  const dtsBundlerConfigPath: string = await createDtsBundlerTsConfig(context);
  const dtsBundleGeneratorPath: string = getDtsBundleGeneratorPath(context.paths.rootDir);

  await $`
    bun ${dtsBundleGeneratorPath} \
      --silent \
      --project ${dtsBundlerConfigPath} \
      --out-file ${context.paths.outputSchemasDtsPath} \
      --no-check \
      --export-referenced-types=false \
      --external-imports=@dotfiles/core \
      --external-imports=zod \
      --external-imports=bun \
      --external-inlines=@dotfiles/config \
      --external-inlines=@dotfiles/logger \
      --external-inlines=@dotfiles/installer-brew \
      --external-inlines=@dotfiles/installer-cargo \
      --external-inlines=@dotfiles/installer-curl-script \
      --external-inlines=@dotfiles/installer-curl-binary \
      --external-inlines=@dotfiles/installer-curl-tar \
      --external-inlines=@dotfiles/installer-github \
      --external-inlines=@dotfiles/installer-manual \
      -- ${schemaExportsPath}
  `;

  console.log('✅ Successfully created schemas.d.ts with dts-bundle-generator');
}
