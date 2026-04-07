#!/usr/bin/env bun

/**
 * Release Script
 *
 * Orchestrates the complete release process: version bump, build, and publish.
 *
 * This script:
 * 1. Bumps version in package.json (without committing)
 * 2. Runs the build
 * 3. On success: commits the version change, creates and pushes a git tag, then publishes to npm
 * 4. On failure before git finalization: reverts the version change in package.json
 *
 * Prerequisites:
 * - Must be authenticated with npm (npm login)
 * - Must have publish permissions for the public @alexgorbatchev scope package
 * - Git working directory must be clean for non-dry-run releases
 *
 * Usage:
 *   bun run release              # Patch bump (1.0.0 -> 1.0.1)
 *   bun run release patch        # Patch bump (1.0.0 -> 1.0.1)
 *   bun run release minor        # Minor bump (1.0.0 -> 1.1.0)
 *   bun run release major        # Major bump (1.0.0 -> 2.0.0)
 *   bun run release --dry-run    # Run everything except commit, tag, and publish
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeCommand } from '../git-utils';
import { cdToRepoRoot } from '../path-utils';

cdToRepoRoot();

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const distDir = path.join(rootDir, '.dist');

type VersionBumpType = 'patch' | 'minor' | 'major' | string;

function isValidBumpType(value: string): value is VersionBumpType {
  // It's a bump type or a direct semantic version string (e.g., "1.2.3")
  return value === 'patch' || value === 'minor' || value === 'major' ||
    /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(value);
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

  if (previousVersion === bumpType) {
    console.log(`ℹ️ Version is already ${bumpType}, skipping bump.`);
    return previousVersion;
  }

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
 * Runs the compile script.
 */
async function runBuild(): Promise<void> {
  console.log('🏗️  Running compile...');
  await executeCommand(['bun', 'run', 'compile']);
}

/**
 * Commits the version change and creates a git tag.
 */
async function commitAndTag(version: string, didBump: boolean): Promise<void> {
  if (didBump) {
    console.log('📝 Committing version change...');
    await executeCommand(['git', 'add', 'package.json']);
    await executeCommand(['git', 'commit', '-m', `Version ${version}`]);
  }
  
  console.log(`📝 Creating tag v${version}...`);
  await executeCommand(['git', 'tag', `v${version}`]);
  console.log(`✅ Created tag v${version}`);
}

/**
 * Pushes the release commit and tag before publishing.
 */
async function pushRelease(version: string): Promise<void> {
  console.log('🚀 Pushing release commit and tag...');
  await executeCommand(['git', 'push']);
  await executeCommand(['git', 'push', 'origin', `v${version}`]);
  console.log(`✅ Pushed release commit and tag v${version}`);
}

/**
 * Checks if there are uncommitted changes in the working directory.
 */
async function hasUncommittedChanges(): Promise<boolean> {
  const result = await Bun.$`git status --porcelain`.quiet().nothrow();
  const output = result.stdout.toString().trim();
  return output.length > 0;
}

function verifyPublicReadme(): void {
  const releaseReadmePath = path.join(distDir, 'README.md');
  if (!fs.existsSync(releaseReadmePath)) {
    throw new Error(`Built README is missing: ${releaseReadmePath}`);
  }

  const readmeContent = fs.readFileSync(releaseReadmePath, 'utf-8');

  if (!readmeContent.includes('Bun runtime requirement')) {
    throw new Error('Built README is missing the Bun runtime requirement section.');
  }
}

/**
 * Removes the npm publish step entirely, as it is now handled by GitHub Actions (.github/workflows/publish.yml).
 */

async function release(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const bumpType = args.find((arg) => arg !== '--dry-run') ?? 'patch';

  if (!isValidBumpType(bumpType)) {
    console.error(
      `Invalid bump type/version: ${bumpType}. Use 'patch', 'minor', 'major', or a specific semantic version like '1.2.3'.`,
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log('🧪 Dry run mode — will skip commit, tag, and publish.');
  }

  if (!dryRun && await hasUncommittedChanges()) {
    throw new Error('Working directory is not clean. Release requires a clean git state.');
  }

  let newVersion: string | undefined;
  let didBumpVersion = false;

  try {
    const previousVersion = readCurrentVersion();

    // Step 1: Bump version (no commit yet)
    newVersion = await bumpVersion(bumpType);
    didBumpVersion = newVersion !== previousVersion;

    // Step 2: Run build
    await runBuild();
    verifyPublicReadme();

    if (dryRun) {
      if (didBumpVersion) await revertVersionChange();
      console.log(`\n✅ Dry run complete — build succeeded for version ${newVersion}.`);
      return;
    }

    // Step 3: Finalize git state and trigger CI publish via tag push
    await commitAndTag(newVersion, didBumpVersion);
    await pushRelease(newVersion);

    console.log(
      `\n🎉 Version updated, tagged, and pushed! GitHub Actions will now publish release ${newVersion} to npm.`,
    );
  } catch (error) {
    // Build or push failed - revert version change if it was not committed yet
    console.error('\n❌ Release push failed:', error instanceof Error ? error.message : error);

    if (newVersion && !dryRun) {
      console.error(
        '⚠️  Git tagging/pushing may have failed mid-way. Inspect git commit/tag state manually.',
      );
      process.exit(1);
    }

    if (newVersion && didBumpVersion) {
      try {
        await revertVersionChange();
      } catch (revertError) {
        console.error(
          '⚠️  Failed to revert version change:',
          revertError instanceof Error ? revertError.message : revertError,
        );
      }
    }

    process.exit(1);
  }
}

// Only run if executed directly
if (import.meta.main) {
  release();
}
