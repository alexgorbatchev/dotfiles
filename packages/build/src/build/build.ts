import { handleBuildError } from './handleBuildError';
import { createBuildContext } from './helpers';
import {
  buildCli,
  cleanPreviousBuild,
  cleanupTempFiles,
  copyDocs,
  enforceCliBundleSizeLimit,
  ensureWorkspaceDependencies,
  generateDistPackageJson,
  generateSchemaTypes,
  generateToolTypesFile,
  printBuildSummary,
  resolveRuntimeDependencies,
  runTypeTests,
  testBuiltCli,
  verifyDistCheckInstall,
} from './steps';
import type { IBuildContext, IResolvedRuntimeDependencies } from './types';

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

  await verifyDistCheckInstall(context);

  enforceCliBundleSizeLimit(context);
  copyDocs(context);
  generateToolTypesFile(context);

  await runTypeTests(context);
  await testBuiltCli(context);
  await cleanupTempFiles(context);

  await printBuildSummary(context);
}

async function main(): Promise<void> {
  const context: IBuildContext = createBuildContext();

  await handleBuildError(
    async () => {
      await runBuild(context);
    },
    async () => {
      await cleanupTempFiles(context);
    },
  );
}

await main();
