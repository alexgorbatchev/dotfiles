import fs from 'node:fs';
import path from 'node:path';

import { $ } from 'dax-sh';
import { BuildError } from '../handleBuildError';
import { copyFileIfExists, createDistCheckPackageJson } from '../helpers';
import type { IBuildContext } from '../types';

interface IDistCheckPaths {
  distCheckDir: string;
  distCheckPackageJsonPath: string;
  distCheckNpmrcPath: string;
}

function getDistCheckPaths(context: IBuildContext): IDistCheckPaths {
  const distCheckDir: string = path.join(context.paths.tmpDir, 'dist-check');

  const distCheckPackageJsonPath: string = path.join(distCheckDir, 'package.json');
  const distCheckNpmrcPath: string = path.join(distCheckDir, '.npmrc');

  const result: IDistCheckPaths = {
    distCheckDir,
    distCheckPackageJsonPath,
    distCheckNpmrcPath,
  };

  return result;
}

export async function verifyDistCheckInstall(context: IBuildContext): Promise<void> {
  console.log('📦 Verifying .dist can be installed...');

  const distCheckPaths = getDistCheckPaths(context);

  fs.rmSync(distCheckPaths.distCheckDir, { recursive: true, force: true });
  fs.mkdirSync(distCheckPaths.distCheckDir, { recursive: true });

  const packageJson = createDistCheckPackageJson();
  fs.writeFileSync(distCheckPaths.distCheckPackageJsonPath, JSON.stringify(packageJson, null, 2));

  copyFileIfExists(context.paths.npmrcPath, distCheckPaths.distCheckNpmrcPath);

  const installResult = await $`bun install`.quiet().noThrow().cwd(distCheckPaths.distCheckDir);

  if (installResult.code === 0) {
    console.log('✅ .dist install check passed');
    return;
  }

  console.error(`❌ .dist install check failed with exit code: ${installResult.code}`);
  console.error(`Error output: ${installResult.stderr.toString()}`);
  throw new BuildError('Dist install check failed');
}
