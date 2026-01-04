#!/usr/bin/env bun
/** biome-ignore-all lint/suspicious/noConsole: build script */

/**
 * Release Script
 *
 * Orchestrates the complete release process: version bump, build, and publish.
 *
 * This script:
 * 1. Bumps version in package.json (without committing)
 * 2. Runs the build
 * 3. On success: commits the version change and publishes to npm
 * 4. On failure: reverts the version change in package.json
 *
 * Prerequisites:
 * - Must be authenticated with npm (npm login)
 * - Must have publish permissions for the @gitea/dotfiles package
 * - Git working directory should be clean (will warn if not)
 *
 * Usage:
 *   bun run release          # Patch bump (1.0.0 -> 1.0.1)
 *   bun run release patch    # Patch bump (1.0.0 -> 1.0.1)
 *   bun run release minor    # Minor bump (1.0.0 -> 1.1.0)
 *   bun run release major    # Major bump (1.0.0 -> 2.0.0)
 */

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import { executeCommand } from '../git-utils';
import { cdToRepoRoot } from '../path-utils';

cdToRepoRoot();

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const distDir = path.join(rootDir, '.dist');

type VersionBumpType = 'patch' | 'minor' | 'major';

function isValidBumpType(value: string): value is VersionBumpType {
  return value === 'patch' || value === 'minor' || value === 'major';
}

/**
 * Reads the current version from package.json.
 */
function readCurrentVersion(): string {
  const content = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);
  const version: string = packageJson.version;
  return version;
}

/**
 * Bumps the version in package.json without committing.
 * Uses `bun pm version` with `--no-git-tag-version` flag.
 */
async function bumpVersion(bumpType: VersionBumpType): Promise<string> {
  const previousVersion = readCurrentVersion();
  console.log(`📦 Current version: ${previousVersion}`);
  console.log(`🔄 Bumping ${bumpType} version...`);

  await executeCommand(['bun', 'pm', 'version', bumpType, '--no-git-tag-version']);

  const newVersion = readCurrentVersion();
  console.log(`✅ Version bumped: ${previousVersion} → ${newVersion}`);
  return newVersion;
}

/**
 * Reverts the version change in package.json using git checkout.
 */
async function revertVersionChange(): Promise<void> {
  console.log('🔄 Reverting version change...');
  await executeCommand(['git', 'checkout', 'package.json']);
  console.log('✅ Version change reverted');
}

/**
 * Runs the build script.
 */
async function runBuild(): Promise<void> {
  console.log('🏗️  Running build...');
  await executeCommand(['bun', 'run', 'build']);
}

/**
 * Commits the version change and creates a git tag.
 */
async function commitAndTag(version: string): Promise<void> {
  console.log('📝 Committing version change...');
  await executeCommand(['git', 'add', 'package.json']);
  await executeCommand(['git', 'commit', '-m', `Version ${version}`]);
  console.log(`✅ Committed version ${version}`);
}

/**
 * Publishes the package to npm.
 */
async function publishToNpm(): Promise<void> {
  console.log('📤 Publishing to npm...');
  await executeCommand(['npm', 'publish'], { cwd: distDir });
  console.log('✅ Package published successfully');
}

/**
 * Checks if there are uncommitted changes in the working directory.
 */
async function hasUncommittedChanges(): Promise<boolean> {
  const result = await $`git status --porcelain`.quiet().nothrow();
  const output = result.stdout.toString().trim();
  return output.length > 0;
}

/**
 * Main release entry point.
 */
async function release(): Promise<void> {
  const args = process.argv.slice(2);
  const bumpType = args[0] ?? 'patch';

  if (!isValidBumpType(bumpType)) {
    console.error(`Invalid bump type: ${bumpType}. Use 'patch', 'minor', or 'major'.`);
    process.exit(1);
  }

  // Warn if there are uncommitted changes
  if (await hasUncommittedChanges()) {
    console.warn('⚠️  Warning: You have uncommitted changes in your working directory.');
  }

  let newVersion: string | undefined;

  try {
    // Step 1: Bump version (no commit yet)
    newVersion = await bumpVersion(bumpType);

    // Step 2: Run build
    await runBuild();

    // Step 3: Build succeeded - commit and publish
    await commitAndTag(newVersion);
    await publishToNpm();

    console.log(`\n🎉 Release ${newVersion} completed successfully!`);
  } catch (error) {
    // Build or publish failed - revert version change
    console.error('\n❌ Release failed:', error instanceof Error ? error.message : error);

    if (newVersion) {
      try {
        await revertVersionChange();
      } catch (revertError) {
        console.error('⚠️  Failed to revert version change:', revertError instanceof Error ? revertError.message : revertError);
      }
    }

    process.exit(1);
  }
}

// Only run if executed directly
if (import.meta.main) {
  release();
}
