#!/usr/bin/env bun

/**
 * NPM Publishing Script
 *
 * Publishes the built package to the npm registry.
 *
 * This script:
 * 1. Verifies that the .dist directory exists with a valid package.json
 * 2. Publishes the package from the .dist directory to npm
 * 3. Confirms successful publication
 *
 * Prerequisites:
 * - Must run `bun run release` first to create the build
 * - Must be authenticated with npm (npm login)
 * - Must have publish permissions for the @gitea/dotfiles package
 *
 * Usage:
 *   bun run publish
 *
 * Workflow:
 *   bun run version [type] -> bun run release -> bun run publish
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeCommand } from '../git-utils';
import { cdToRepoRoot } from '../path-utils';

cdToRepoRoot();

const rootDir = process.cwd();
const distDir = path.join(rootDir, '.dist');

/**
 * Verifies that the `.dist` directory exists with a valid package.json.
 *
 * @throws {Error} If the .dist directory or package.json is missing.
 */
async function checkDistExists(): Promise<void> {
  if (!fs.existsSync(distDir)) {
    throw new Error('Build output not found. Please run "bun run release" first to create the build.');
  }

  const packageJsonPath = path.join(distDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in .dist directory');
  }
}

/**
 * Publishes the package to the npm registry.
 *
 * Runs `npm publish` from the `.dist` directory to publish the built package.
 * Requires prior authentication with npm (via `npm login`).
 */
async function publishToNpm(): Promise<void> {
  await executeCommand(['npm', 'publish'], { cwd: distDir });
}

/**
 * Main publishing entry point.
 *
 * Orchestrates the npm publishing process:
 * 1. Verifies that the build output exists in `.dist`
 * 2. Publishes the package to npm
 *
 * Prerequisites:
 * - Must run `bun run release` first to create the build
 * - Must be authenticated with npm (`npm login`)
 * - Must have publish permissions for @gitea/dotfiles
 *
 * @throws {Error} If build output is missing or npm publish fails.
 */
export async function publish(): Promise<void> {
  // Step 1: Check that build exists
  await checkDistExists();

  // Step 2: Publish to npm
  await publishToNpm();
}

// Only run if executed directly
if (import.meta.main) {
  publish().catch((_error) => {
    process.exit(1);
  });
}
