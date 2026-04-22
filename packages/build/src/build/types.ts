export interface IDependencyVersions {
  zod: string;
  bunTypes: string;
  nodeTypes: string;
}

export interface IResolvedRuntimeDependencies {
  externalRuntimeDependencies: string[];
  runtimeDependencyVersions: Record<string, string>;
  dependencyVersions: IDependencyVersions;
}

export interface ITypeTestFile {
  packageName: string;
  fileName: string;
  sourcePath: string;
}

export interface IBuildPaths {
  rootDir: string;
  packagesDir: string;
  tmpDir: string;
  outputDir: string;

  cliOutputFile: string;
  cliOutputSourceMapFile: string;
  compiledBinaryOutputFile: string;
  entryPoint: string;

  bunfigPath: string;

  buildTsconfigPath: string;

  tempSchemasBuildDir: string;
  tempSchemasPackagePath: string;

  outputPackagesDir: string;
  outputPackageJsonPath: string;
  outputBunfigPath: string;
  outputBunLockPath: string;

  outputSchemasDtsPath: string;
  outputAuthoringTypesDtsPath: string;
  schemaCheckTsconfigPath: string;

  rootNodeModulesPath: string;
  rootBunCachePath: string;

  tsdTestsDir: string;
  tsdTestsConfigPath: string;
  tsdTestsPackageJsonPath: string;
  tsdTestsNodeModulesPath: string;
  tsdTestsScopedNamespacePath: string;
  tsdTestsScopedPackagePath: string;
  tsdTestsGeneratedDir: string;
  tsdTestsToolTypesPath: string;

  skillDir: string;
  outputSkillDir: string;
}

export interface IBuildConstants {
  maxCliBundleSizeKb: number;
  maxCliBundleSizeBytes: number;
  typeTestsDirName: string;
  tsdTestFileExtension: string;
  excludedPackageCopyDirs: string[];
}

export interface IBuildContext {
  paths: IBuildPaths;
  constants: IBuildConstants;
}
