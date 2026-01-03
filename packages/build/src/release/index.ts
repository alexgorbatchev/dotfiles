#!/usr/bin/env bun

/** biome-ignore-all lint/suspicious/noConsole: build script */

/**
 * Release Preparation Script
 *
 * Displays the contents of the .dist directory for verification before publishing.
 *
 * This is typically run after version bumping and building, before publishing to npm.
 * The output in .dist directory is ready for npm publish.
 *
 * Usage:
 *   bun run release
 *
 * Workflow:
 *   bun run version [type] -> bun run build -> bun run release -> bun run publish
 */

import fs from 'node:fs';
import path from 'node:path';
import { cdToRepoRoot } from '../path-utils';

cdToRepoRoot();

const rootDir = process.cwd();
const distDir = path.join(rootDir, '.dist');

/**
 * Displays the contents of the `.dist` directory.
 *
 * Lists all files in the build output directory to allow verification
 * of the build artifacts before publishing.
 */
async function showDistContents(): Promise<void> {
  if (!fs.existsSync(distDir)) {
    return;
  }

  console.log('📦 .dist contents:');
  const files = fs.readdirSync(distDir);
  for (const file of files.sort()) {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      const sizeKb: number = Math.ceil(stats.size / 1024);
      console.log(`  - ${file} (${sizeKb} KB)`);
    }
  }
}

/**
 * Main release preparation entry point.
 *
 * Displays the contents of the `.dist` directory for verification.
 *
 * The output in `.dist` is ready for npm publishing via `bun run publish`.
 *
 * Typical workflow: `bun run version [type]` → `bun run build` → `bun run release` → `bun run publish`
 *
 * @throws {Error} If the process fails.
 */
export async function release(): Promise<void> {
  await showDistContents();
}

// Only run if executed directly
if (import.meta.main) {
  release().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
