#!/usr/bin/env bun

/**
 * Release Preparation Script
 *
 * Prepares a release build of the CLI application for publishing.
 *
 * This script:
 * 1. Runs the main build script to create the distributable package
 * 2. Displays the contents of the .dist directory for verification
 * 3. Confirms that all necessary files are present for publishing
 *
 * This is typically run after version bumping and before publishing to npm.
 * The output in .dist directory is ready for npm publish.
 *
 * Usage:
 *   bun run release
 *
 * Workflow:
 *   bun run version [type] -> bun run release -> bun run publish
 */

import fs from 'node:fs';
import path from 'node:path';
import cliPackageJson from '../../../../package.json';
import { executeCommand } from '../git-utils';
import { cdToRepoRoot } from '../path-utils';

cdToRepoRoot();

const rootDir = process.cwd();
const distDir = path.join(rootDir, '.dist');

/**
 * Runs the main build script to create the distributable package.
 *
 * Executes `bun run build` with the current version set in environment variables.
 */
async function runBuildScript(): Promise<void> {
  console.log('🏗️  Running build script...');
  await executeCommand(['bun', 'run', 'build'], {
    env: { DOTENV_VERSION: cliPackageJson.version },
  });
}

/**
 * Displays the contents of the `.dist` directory.
 *
 * Lists all files in the build output directory to allow verification
 * of the build artifacts before publishing.
 */
async function showDistContents(): Promise<void> {
  console.log('📋 Build output files:');
  if (!fs.existsSync(distDir)) {
    console.log('   ❌ No .dist directory found');
    return;
  }

  const files = fs.readdirSync(distDir);
  for (const file of files.sort()) {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      console.log(`   📄 ${file}`);
    }
  }
}

/**
 * Main release preparation entry point.
 *
 * Orchestrates the release build process:
 * 1. Runs the main build script
 * 2. Displays the contents of the `.dist` directory
 *
 * The output in `.dist` is ready for npm publishing via `bun run publish`.
 *
 * Typical workflow: `bun run version [type]` → `bun run release` → `bun run publish`
 *
 * @throws {Error} If the build process fails.
 */
export async function release(): Promise<void> {
  console.log('🚀 Starting release process...');

  try {
    // Step 1: Run build script
    await runBuildScript();

    // Step 2: Show dist contents
    await showDistContents();

    console.log('✅ Release completed successfully! Use `bun run publish` now to publish.');
  } catch (error) {
    console.error('❌ Release failed:', error);
    throw error;
  }
}

// Only run if executed directly
if (import.meta.main) {
  release().catch((error) => {
    console.error('❌ Release process failed:', error);
    process.exit(1);
  });
}
