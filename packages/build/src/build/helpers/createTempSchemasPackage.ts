import { getPackageJson } from "../../getPackageJson";
import type { IBuildContext, IDependencyVersions } from "../types";
import { copyFileIfExists } from "./copyFileIfExists";

/**
 * Prepares a temporary workspace used by schema bundling.
 *
 * Notes:
 * - `tsgo` runs before this step and emits declaration files using the root workspace environment.
 * - This step makes the later “install in output dir” deterministic by writing:
 *   - a temp package.json under the temp schemas build directory, and
 *   - a temporary workspace root package.json in the output directory.
 * - Without these files, the build can appear to work depending on the root workspace install and
 *   how tolerant the schema bundling tooling is to unresolved externals.
 */
export async function createTempSchemasPackage(
  context: IBuildContext,
  dependencyVersions: IDependencyVersions,
): Promise<void> {
  const tempPackageJson: Record<string, unknown> = {
    name: "temp-schemas",
    version: "0.0.0",
    type: "module",
    dependencies: {
      zod: dependencyVersions.zod,
      "@types/bun": dependencyVersions.bunTypes,
      "@types/node": dependencyVersions.nodeTypes,
      "@dotfiles/core": "workspace:*",
      "@dotfiles/config": "workspace:*",
      "@dotfiles/logger": "workspace:*",
      "@dotfiles/installer-apt": "workspace:*",
      "@dotfiles/installer-brew": "workspace:*",
      "@dotfiles/installer-cargo": "workspace:*",
      "@dotfiles/installer-curl-binary": "workspace:*",
      "@dotfiles/installer-curl-script": "workspace:*",
      "@dotfiles/installer-curl-tar": "workspace:*",
      "@dotfiles/installer-dnf": "workspace:*",
      "@dotfiles/installer-pacman": "workspace:*",
      "@dotfiles/installer-github": "workspace:*",
      "@dotfiles/installer-manual": "workspace:*",
      "@dotfiles/tool-config-builder": "workspace:*",
    },
  };

  const rootPackageJson = getPackageJson();

  const tempRootPackageJson: Record<string, unknown> = {
    name: "temp-root",
    private: true,
    workspaces: [context.paths.tempSchemasBuildDir, `${context.paths.outputPackagesDir}/*`],
    catalog: rootPackageJson.catalog,
    catalogs: rootPackageJson.catalogs,
  };

  await Bun.write(context.paths.tempSchemasPackagePath, JSON.stringify(tempPackageJson, null, 2));
  await Bun.write(context.paths.outputPackageJsonPath, JSON.stringify(tempRootPackageJson, null, 2));

  copyFileIfExists(context.paths.bunfigPath, context.paths.outputBunfigPath);
}
