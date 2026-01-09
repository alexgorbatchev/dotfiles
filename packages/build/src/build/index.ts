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

import { $ } from 'dax-sh';
import { getPackageJson } from '../getPackageJson';

async function main() {
  const results = await $`bun run build.ts`
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
