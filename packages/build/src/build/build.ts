import { handleBuildError } from "./handleBuildError";
import { createBuildContext, installDependenciesInOutputDir } from "./helpers";
import {
  buildCompiledBinary,
  buildCli,
  cleanPreviousBuild,
  cleanupTempFiles,
  copyPublicPackageAssets,
  copySkill,
  enforceCliBundleSizeLimit,
  ensureWorkspaceDependencies,
  generateDistPackageJson,
  generateSchemaTypes,
  generateToolTypesFile,
  printBuildSummary,
  resolveRuntimeDependencies,
  runTypeTests,
  testCompiledBinaryBuild,
  testPackedBuild,
} from "./steps";
import type { IBuildContext, IResolvedRuntimeDependencies } from "./types";

async function runBuild(context: IBuildContext): Promise<void> {
  await ensureWorkspaceDependencies(context);
  await cleanPreviousBuild(context);

  await buildCli(context);

  const runtimeDependencies: IResolvedRuntimeDependencies = await resolveRuntimeDependencies(context);

  await generateSchemaTypes(context, runtimeDependencies.dependencyVersions);
  await generateDistPackageJson(
    context,
    runtimeDependencies.dependencyVersions,
    runtimeDependencies.runtimeDependencyVersions,
  );

  // Must reinstall after generating production package.json
  // because the prior install used workspace mode
  await installDependenciesInOutputDir(context);

  enforceCliBundleSizeLimit(context);
  copySkill(context);
  await copyPublicPackageAssets(context);
  generateToolTypesFile(context);

  await runTypeTests(context);

  // Test from packed npm package to catch missing files in `files` array
  await testPackedBuild(context);
  await buildCompiledBinary(context);
  await testCompiledBinaryBuild(context);

  await cleanupTempFiles(context);

  await printBuildSummary(context);
}

async function main(): Promise<void> {
  const context: IBuildContext = createBuildContext();

  await handleBuildError(async () => {
    await runBuild(context);
  });
}

await main();
