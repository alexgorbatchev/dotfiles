/**
 * Test helper for creating mock IBuildContext instances
 */

import type { IBuildConstants, IBuildContext, IBuildPaths } from "../../../build/types";

interface IMockBuildContextOverrides {
  paths?: Partial<IBuildPaths>;
  constants?: Partial<IBuildConstants>;
}

type MockBuildContextOverrides = IMockBuildContextOverrides;

export function createMockBuildContext(overrides?: MockBuildContextOverrides): IBuildContext {
  const defaultPaths: IBuildPaths = {
    rootDir: "/root",
    packagesDir: "/root/packages",
    tmpDir: "/root/.tmp",
    outputDir: "/root/.dist",
    cliOutputFile: "/root/.dist/cli.js",
    cliOutputSourceMapFile: "/root/.dist/cli.js.map",
    entryPoint: "/root/packages/cli/src/cli.ts",
    bunfigPath: "/root/bunfig.toml",
    buildTsconfigPath: "/root/.tmp/build-tsconfig.json",
    tempSchemasBuildDir: "/root/.tmp/schemas-build",
    tempSchemasPackagePath: "/root/.tmp/schemas",
    outputPackagesDir: "/root/.dist/packages",
    outputPackageJsonPath: "/root/.dist/package.json",
    outputBunfigPath: "/root/.dist/bunfig.toml",
    outputBunLockPath: "/root/.dist/bun.lockb",
    outputSchemasDtsPath: "/root/.dist/schemas.d.ts",
    schemaCheckTsconfigPath: "/root/.tmp/schemas-check-tsconfig.json",
    rootNodeModulesPath: "/root/node_modules",
    rootBunCachePath: "/root/.bun-cache",
    tsdTestsDir: "/root/.tmp/tsd-tests",
    tsdTestsConfigPath: "/root/.tmp/tsd-tests/tsconfig.json",
    tsdTestsPackageJsonPath: "/root/.tmp/tsd-tests/package.json",
    tsdTestsNodeModulesPath: "/root/.tmp/tsd-tests/node_modules",
    tsdTestsScopedNamespacePath: "/root/.tmp/tsd-tests/@alexgorbatchev",
    tsdTestsScopedPackagePath: "/root/.tmp/tsd-tests/@alexgorbatchev/dotfiles",
    tsdTestsGeneratedDir: "/root/.tmp/tsd-tests/.generated",
    tsdTestsToolTypesPath: "/root/.tmp/tsd-tests/.generated/tool-types.d.ts",
    skillDir: "/root/.agents/skills/dotfiles",
    outputSkillDir: "/root/.dist/skill",
  };

  const defaultConstants: IBuildConstants = {
    maxCliBundleSizeKb: 1024,
    maxCliBundleSizeBytes: 1024 * 1024,
    typeTestsDirName: "__tests__",
    tsdTestFileExtension: ".test.ts",
    excludedPackageCopyDirs: [".git", "node_modules", "__tests__"],
  };

  const finalPaths: IBuildPaths = { ...defaultPaths, ...overrides?.paths };
  const finalConstants: IBuildConstants = { ...defaultConstants, ...overrides?.constants };

  const context: IBuildContext = {
    paths: finalPaths,
    constants: finalConstants,
  };

  return context;
}
