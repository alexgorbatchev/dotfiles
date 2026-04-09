import path from "node:path";

import { getRepoRoot } from "../../path-utils";
import type { IBuildConstants, IBuildContext, IBuildPaths } from "../types";

/**
 * Constructs the build context with resolved paths and build constants.
 */
export function createBuildContext(): IBuildContext {
  const rootDir: string = getRepoRoot();
  const packagesDir: string = path.join(rootDir, "packages");
  const tmpDir: string = path.join(rootDir, ".tmp");
  const outputDir: string = path.join(rootDir, ".dist");

  const cliOutputFile: string = path.join(outputDir, "cli.js");
  const cliOutputSourceMapFile: string = path.join(outputDir, "cli.js.map");

  const entryPoint: string = path.resolve(packagesDir, "cli/src/cli.ts");

  const bunfigPath: string = path.join(rootDir, "bunfig.toml");

  const buildTsconfigPath: string = path.join(outputDir, "tsconfig--build.json");

  const tempSchemasBuildDirName: string = "temp-schemas-build";
  const tempSchemasBuildDir: string = path.join(tmpDir, tempSchemasBuildDirName);
  const tempSchemasPackagePath: string = path.join(tempSchemasBuildDir, "package.json");

  const outputPackagesDir: string = path.join(outputDir, "packages");

  const outputPackageJsonPath: string = path.join(outputDir, "package.json");
  const outputBunfigPath: string = path.join(outputDir, "bunfig.toml");
  const outputBunLockPath: string = path.join(outputDir, "bun.lock");

  const outputSchemasDtsPath: string = path.join(outputDir, "schemas.d.ts");
  const schemaCheckTsconfigPath: string = path.join(outputDir, "tsconfig--schemas-check.json");

  const rootNodeModulesPath: string = path.join(rootDir, "node_modules");
  const rootBunCachePath: string = path.join(rootNodeModulesPath, ".bun");

  const tsdTestsDir: string = path.join(tmpDir, "tsd-tests");
  const tsdTestsConfigPath: string = path.join(tsdTestsDir, "tsconfig.json");
  const tsdTestsPackageJsonPath: string = path.join(tsdTestsDir, "package.json");

  const tsdTestsNodeModulesPath: string = path.join(tsdTestsDir, "node_modules");
  const tsdTestsGeneratedDir: string = path.join(tsdTestsDir, ".generated");
  const tsdTestsScopedNamespacePath: string = path.join(tsdTestsNodeModulesPath, "@alexgorbatchev");
  const tsdTestsScopedPackagePath: string = path.join(tsdTestsScopedNamespacePath, "dotfiles");
  const tsdTestsToolTypesPath: string = path.join(tsdTestsGeneratedDir, "tool-types.d.ts");

  const skillDir: string = path.join(rootDir, ".agents", "skills", "dotfiles");
  const outputSkillDir: string = path.join(outputDir, "skill");

  const paths: IBuildPaths = {
    rootDir,
    packagesDir,
    tmpDir,
    outputDir,

    cliOutputFile,
    cliOutputSourceMapFile,
    entryPoint,

    bunfigPath,

    buildTsconfigPath,

    tempSchemasBuildDir,
    tempSchemasPackagePath,

    outputPackagesDir,
    outputPackageJsonPath,
    outputBunfigPath,
    outputBunLockPath,

    outputSchemasDtsPath,
    schemaCheckTsconfigPath,

    rootNodeModulesPath,
    rootBunCachePath,

    tsdTestsDir,
    tsdTestsConfigPath,
    tsdTestsPackageJsonPath,
    tsdTestsNodeModulesPath,
    tsdTestsScopedNamespacePath,
    tsdTestsScopedPackagePath,
    tsdTestsGeneratedDir,
    tsdTestsToolTypesPath,

    skillDir,
    outputSkillDir,
  };

  const maxCliBundleSizeKb: number = 500;
  const maxCliBundleSizeBytes: number = maxCliBundleSizeKb * 1024;
  const typeTestsDirName: string = "type-tests";
  const tsdTestFileExtension: string = ".test-d.ts";
  const excludedPackageCopyDirs: string[] = ["node_modules", "__tests__", "type-tests"];

  const constants: IBuildConstants = {
    maxCliBundleSizeKb,
    maxCliBundleSizeBytes,
    typeTestsDirName,
    tsdTestFileExtension,
    excludedPackageCopyDirs,
  };

  const context: IBuildContext = {
    paths,
    constants,
  };

  return context;
}
