import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext } from '../types';
import { copyFileIfExists } from './copyFileIfExists';
import { copyTypeTestFiles } from './copyTypeTestFiles';
import { createTsdTestsEntryPoint } from './createTsdTestsEntryPoint';
import { createTsdTestsPackageJson } from './createTsdTestsPackageJson';
import { createTsdTestsTsConfig } from './createTsdTestsTsConfig';
import { ensureTsdTestsNodeModules } from './ensureTsdTestsNodeModules';

/**
 * Creates a temporary project that runs tsd against the built package output.
 * Mimics actual end user setup where tool-types.d.ts is in a separate .generated folder.
 */
export async function setupTsdTestsProject(context: IBuildContext): Promise<void> {
  fs.rmSync(context.paths.tsdTestsDir, { recursive: true, force: true });
  fs.mkdirSync(context.paths.tsdTestsDir, { recursive: true });

  copyTypeTestFiles(context, context.paths.tsdTestsDir);
  await createTsdTestsPackageJson(context);
  await createTsdTestsEntryPoint(context);
  await createTsdTestsTsConfig(context);
  copyFileIfExists(context.paths.npmrcPath, context.paths.tsdTestsNpmrcPath);
  ensureTsdTestsNodeModules(context);

  // Copy tool-types.d.ts to .generated folder (mimics end user setup)
  fs.mkdirSync(context.paths.tsdTestsGeneratedDir, { recursive: true });
  const sourceToolTypesPath: string = path.join(context.paths.outputDir, 'tool-types.d.ts');
  fs.copyFileSync(sourceToolTypesPath, context.paths.tsdTestsToolTypesPath);
}
