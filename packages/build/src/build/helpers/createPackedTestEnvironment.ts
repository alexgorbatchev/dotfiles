import fs from 'node:fs';
import path from 'node:path';

import { shell } from './shell';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';
import { copyFileIfExists } from './copyFileIfExists';
import { throwIfCertificateError } from './throwIfCertificateError';

export interface IPackedTestEnvironment {
  /** Directory containing the unpacked and installed package */
  testDir: string;
  /** Path to the CLI entry point */
  cliPath: string;
  /** Cleanup function to remove the test directory */
  cleanup: () => void;
}

/**
 * Creates a test environment by packing .dist as an npm package,
 * unpacking it to an isolated directory, and installing dependencies.
 *
 * This ensures tests run against the exact files that would be published,
 * catching issues like missing files in the `files` array.
 */
export async function createPackedTestEnvironment(context: IBuildContext): Promise<IPackedTestEnvironment> {
  const testId = crypto.randomUUID().slice(0, 8);
  const testDir = path.join(context.paths.tmpDir, `pack-test-${testId}`);

  // Clean up any existing test directory
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  // Run npm pack in .dist to create a tarball
  const packResult = await shell`npm pack --pack-destination ${testDir}`.quiet().noThrow().cwd(context.paths.outputDir);

  if (packResult.code !== 0) {
    throw new BuildError(`npm pack failed: ${packResult.stderr.toString()}`);
  }

  // Find the created tarball
  const tarballName = packResult.stdout.toString().trim();
  const tarballPath = path.join(testDir, tarballName);

  if (!fs.existsSync(tarballPath)) {
    throw new BuildError(`Tarball not found at ${tarballPath}`);
  }

  // Create package directory and unpack
  const packageDir = path.join(testDir, 'package');
  fs.mkdirSync(packageDir, { recursive: true });

  const unpackResult = await shell`tar -xzf ${tarballPath} -C ${testDir}`.quiet().noThrow();

  if (unpackResult.code !== 0) {
    throw new BuildError(`Failed to unpack tarball: ${unpackResult.stderr.toString()}`);
  }

  // Copy .npmrc if exists for registry configuration
  copyFileIfExists(context.paths.npmrcPath, path.join(packageDir, '.npmrc'));

  // Install dependencies in the unpacked package
  // stderr("inheritPiped") both prints stderr and captures it so throwIfCertificateError can inspect it.
  // Without it, dax-sh inherits stdio and .stderr.toString() throws "Stdout was not piped".
  const installResult = await shell`bun install`.stderr("inheritPiped").noThrow().cwd(packageDir);

  throwIfCertificateError(installResult.stderr.toString());

  if (installResult.code !== 0) {
    throw new BuildError(`bun install failed in packed environment: ${installResult.stderr.toString()}`);
  }

  // Remove tarball after unpacking
  fs.rmSync(tarballPath, { force: true });

  const cliPath = path.join(packageDir, 'cli.js');

  if (!fs.existsSync(cliPath)) {
    throw new BuildError(`CLI entry point not found at ${cliPath}`);
  }

  return {
    testDir: packageDir,
    cliPath,
    cleanup: () => {
      fs.rmSync(testDir, { recursive: true, force: true });
    },
  };
}
