import { handleBuildError } from "./handleBuildError";
import { createBuildContext } from "./helpers";
import {
  cleanPreviousBuild,
  buildDashboard,
  buildGoBinary,
  generateSchemaTypes,
  generateDistPackageJson,
  writeLauncher,
  enforceGoBinarySizeLimit,
  copySkill,
  copyPublicPackageAssets,
  runTypeTests,
  cleanupTempFiles,
  printBuildSummary,
} from "./steps";
import type { IBuildContext } from "./types";

async function runBuild(context: IBuildContext): Promise<void> {
  // 1. Clean up old build outputs
  await cleanPreviousBuild(context);

  // 2. Build the React dashboard frontend client
  await buildDashboard(context);

  // 3. Statically compile the Go standalone executable
  await buildGoBinary(context);

  // 4. Generate TS config types (types.gen.ts, schemas.d.ts, tool-types.d.ts, authoring-types.d.ts)
  const defaultDeps = { zod: "^4.1.12", bunTypes: "^1.3.5", nodeTypes: "^25.0.0" };
  await generateSchemaTypes(context, defaultDeps);

  // 5. Generate clean package.json files for NPM distribution
  await generateDistPackageJson(context, defaultDeps);

  // 6. Write the lightweight cross-platform binary launcher cli.js
  writeLauncher(context);

  // 7. Validate that the compiled Go binary is under the size threshold
  enforceGoBinarySizeLimit(context);

  // 8. Run TSD type-level tests against the published schemas.d.ts
  await runTypeTests(context);

  // 9. Copy skill reference documents and public package assets
  copySkill(context);
  await copyPublicPackageAssets(context);

  // 10. Clean up any temporary files
  await cleanupTempFiles(context);

  // 11. Print the final build summary report
  await printBuildSummary(context);
}

async function main(): Promise<void> {
  const context: IBuildContext = createBuildContext();

  await handleBuildError(async () => {
    await runBuild(context);
  });
}

await main();
