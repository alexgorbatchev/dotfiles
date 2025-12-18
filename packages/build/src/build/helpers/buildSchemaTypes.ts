/** biome-ignore-all lint/suspicious/noConsole: build script */

import { $ } from 'bun';

import type { IBuildContext, IDependencyVersions } from '../types';
import { copyPackagesToOutputDir } from './copyPackagesToOutputDir';
import { createTempSchemasPackage } from './createTempSchemasPackage';
import { createTempTsConfig } from './createTempTsConfig';
import { installDependenciesInOutputDir } from './installDependenciesInOutputDir';
import { resolveSchemaExportsDtsPath } from './resolveSchemaExportsDtsPath';

/**
 * Builds the bundled schema declarations file used in the published output.
 *
 * Notes:
 * - Declaration emit (`tsgo`) happens first and can use the root workspace environment.
 * - A temporary workspace is created and installed in the output directory to make subsequent
 *   bundling/validation steps deterministic.
 */
export async function buildSchemaTypes(context: IBuildContext, dependencyVersions: IDependencyVersions): Promise<void> {
  await createTempTsConfig(context);
  await $`bun tsgo --project ${context.paths.buildTsconfigPath}`;

  copyPackagesToOutputDir(context);
  await createTempSchemasPackage(context, dependencyVersions);
  await installDependenciesInOutputDir(context);

  const schemaExportsPath: string = resolveSchemaExportsDtsPath(context.paths.tempSchemasBuildDir);

  await $`
    bunx dts-bundle-generator \
      --silent \
      --project ${context.paths.buildTsconfigPath} \
      --out-file ${context.paths.outputSchemasDtsPath} \
      --no-check \
      --export-referenced-types \
      --external-imports=@dotfiles/core \
      --external-imports=zod \
      --external-imports=bun \
      --external-inlines=@dotfiles/config \
      --external-inlines=@dotfiles/logger \
      --external-inlines=@dotfiles/installer-brew \
      --external-inlines=@dotfiles/installer-cargo \
      --external-inlines=@dotfiles/installer-curl-script \
      --external-inlines=@dotfiles/installer-curl-tar \
      --external-inlines=@dotfiles/installer-github \
      --external-inlines=@dotfiles/installer-manual \
      -- ${schemaExportsPath}
  `;

  console.log('✅ Successfully created schemas.d.ts with dts-bundle-generator');
}
