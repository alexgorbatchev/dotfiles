#!/usr/bin/env bun

/**
 * Build Script Entry
 *
 * - Sets up the build environment
 * - Runs the main build script
 *
 * Usage:
 *   bun run build
 */

import { getPackageJson } from '../getPackageJson';
import { shell } from './helpers';

async function main() {
  const results = await shell`bun run build.ts`
    //
    .noThrow()
    .cwd(__dirname)
    .env({
      ...process.env,
      DOTFILES_BUILT_PACKAGE_NAME: '@gitea/dotfiles',
      DOTFILES_VERSION: getPackageJson().version,
    });

  process.exit(results.code);
}

await main();
