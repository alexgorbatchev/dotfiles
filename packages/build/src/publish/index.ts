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

async function checkDistExists(): Promise<void> {
  if (!fs.existsSync(distDir)) {
    throw new Error('Build output not found. Please run "bun run release" first to create the build.');
  }

  const packageJsonPath = path.join(distDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in .dist directory');
  }

  console.log('✓ Build output found in .dist directory');
}

async function publishToNpm(): Promise<void> {
  console.log('📤 Publishing to npm registry...');
  await executeCommand(['npm', 'publish'], { cwd: distDir });
  console.log('✅ Package published successfully!');
}

export async function publish(): Promise<void> {
  console.log('🚀 Starting publish process...');

  try {
    // Step 1: Check that build exists
    await checkDistExists();

    // Step 2: Publish to npm
    await publishToNpm();

    console.log('✅ Publish completed successfully!');
    console.log('🌐 The package is now available on the npm registry');
  } catch (error) {
    console.error('❌ Publish failed:', error);
    throw error;
  }
}

// Only run if executed directly
if (import.meta.main) {
  publish().catch((error) => {
    console.error('❌ Publish process failed:', error);
    process.exit(1);
  });
}
