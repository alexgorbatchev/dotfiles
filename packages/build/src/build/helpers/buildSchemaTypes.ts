import fs from 'node:fs';
import path from 'node:path';

import { shell } from './shell';

import type { IBuildContext, IDependencyVersions } from '../types';
import { copyPackagesToOutputDir } from './copyPackagesToOutputDir';
import { createTempSchemasPackage } from './createTempSchemasPackage';
import { createDtsBundlerTsConfig, createTempTsConfig } from './createTempTsConfig';
import { installDependenciesInOutputDir } from './installDependenciesInOutputDir';
import { resolveSchemaExportsDtsPath } from './resolveSchemaExportsDtsPath';

/**
 * Returns path to dts-bundle-generator binary.
 * Uses require.resolve instead of a hardcoded path because bun may hoist the
 * package into node_modules/.bun/ rather than the top-level node_modules/.
 */
function getDtsBundleGeneratorPath(): string {
  return require.resolve('dts-bundle-generator/dist/bin/dts-bundle-generator.js');
}

/**
 * Collects .d.ts files emitted in-place by tsgo into the temp schemas build directory.
 * tsgo may emit .d.ts files alongside source files instead of into outDir.
 */
function collectInPlaceDtsFiles(context: IBuildContext): void {
  const packagesDir: string = context.paths.packagesDir;
  const tempDir: string = context.paths.tempSchemasBuildDir;

  function walkDir(dir: string): void {
    const entries: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath: string = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'type-tests') continue;
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
        const relativePath: string = path.relative(packagesDir, fullPath);
        const destPath: string = path.join(tempDir, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(fullPath, destPath);
      }
    }
  }

  walkDir(packagesDir);
}

/**
 * Builds the bundled schema declarations file used in the published output.
 *
 * Notes:
 * - Declaration emit (`tsgo`) happens first and can use the root workspace environment.
 * - tsgo may emit .d.ts files in-place (alongside source) instead of into outDir;
 *   in that case, we collect them into the temp schemas build directory.
 * - A temporary workspace is created and installed in the output directory to make subsequent
 *   bundling/validation steps deterministic.
 * - dts-bundle-generator uses a separate tsconfig that points to generated .d.ts files.
 */
export async function buildSchemaTypes(context: IBuildContext, dependencyVersions: IDependencyVersions): Promise<void> {
  await createTempTsConfig(context);
  await shell`bun tsgo --project ${context.paths.buildTsconfigPath}`;

  // If tsgo emitted .d.ts files in-place, collect them into tempSchemasBuildDir
  const expectedDtsPath: string = path.join(context.paths.tempSchemasBuildDir, 'cli', 'src', 'schema-exports.d.ts');
  if (!fs.existsSync(expectedDtsPath)) {
    collectInPlaceDtsFiles(context);
  }

  copyPackagesToOutputDir(context);
  await createTempSchemasPackage(context, dependencyVersions);
  await installDependenciesInOutputDir(context);

  const schemaExportsPath: string = resolveSchemaExportsDtsPath(context.paths.tempSchemasBuildDir);
  const dtsBundlerConfigPath: string = await createDtsBundlerTsConfig(context);
  const dtsBundleGeneratorPath: string = getDtsBundleGeneratorPath();

  await shell`
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
      --external-inlines=@dotfiles/tool-config-builder \
      -- ${schemaExportsPath}
  `;

  console.log('✅ Successfully created schemas.d.ts with dts-bundle-generator');
}
