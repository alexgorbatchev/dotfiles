#!/usr/bin/env bun

/**
 * Version Management Script
 *
 * Manages version bumping for the project following semantic versioning.
 *
 * This script:
 * 1. Validates that the working directory is a clean git repository
 * 2. Reads the current version from package.json
 * 3. Bumps the version according to the specified type (major/minor/patch) or sets a specific version
 * 4. Updates package.json with the new version
 * 5. Stages package.json and creates a git commit with the version message
 *
 * Usage:
 *   bun run version          # Patch bump (1.0.0 -> 1.0.1)
 *   bun run version patch    # Patch bump (1.0.0 -> 1.0.1)
 *   bun run version minor    # Minor bump (1.0.0 -> 1.1.0)
 *   bun run version major    # Major bump (1.0.0 -> 2.0.0)
 *   bun run version 2.5.3    # Set specific version
 */

import fs from 'node:fs';
import path from 'node:path';
import cliPackageJson from '../../../../package.json';
import { executeCommand, validateGitRepository } from '../git-utils';
import { cdToRepoRoot } from '../path-utils';

cdToRepoRoot();

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');

/**
 * Parses a semantic version string into its components.
 *
 * @param version - The version string to parse (e.g., '1.2.3').
 * @returns An object containing major, minor, and patch version numbers.
 * @throws {Error} If the version format is invalid.
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const major = Number.parseInt(parts[0] ?? '0', 10);
  const minor = Number.parseInt(parts[1] ?? '0', 10);
  const patch = Number.parseInt(parts[2] ?? '0', 10);

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  return { major, minor, patch };
}

/**
 * Bumps a semantic version according to the specified type.
 *
 * @param currentVersion - The current version string (e.g., '1.2.3').
 * @param bumpType - The type of version bump to perform.
 * @returns The new version string after bumping.
 */
function bumpVersion(currentVersion: string, bumpType: 'major' | 'minor' | 'patch'): string {
  const { major, minor, patch } = parseVersion(currentVersion);

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

/**
 * Updates the version field in package.json.
 *
 * Reads the package.json file, updates the version field, and writes it back
 * with proper formatting (2-space indentation and trailing newline).
 *
 * @param newVersion - The new version string to set.
 */
async function updatePackageJsonVersion(newVersion: string): Promise<void> {
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`✓ Updated package.json to version ${newVersion}`);
}

/**
 * Stages package.json and creates a git commit with the version message.
 *
 * @param version - The version string to use in the commit message.
 */
async function stageAndCommit(version: string): Promise<void> {
  console.log('📝 Staging package.json...');
  await executeCommand(['git', 'add', 'package.json'], { cwd: rootDir });

  console.log('💾 Creating commit...');
  await executeCommand(['git', 'commit', '-m', `Version ${version}`], { cwd: rootDir });

  console.log(`✅ Committed version ${version}`);
}

/**
 * Main version management entry point.
 *
 * Processes command-line arguments, validates the git repository,
 * bumps or sets the version, updates package.json, and creates a git commit.
 *
 * Supported arguments:
 * - No arguments or 'patch': Bumps patch version
 * - 'minor': Bumps minor version
 * - 'major': Bumps major version
 * - Specific version (e.g., '2.5.3'): Sets exact version
 * - '--help' or '-h': Shows usage information
 *
 * @throws {Error} If git validation fails or version update process encounters an error.
 */
async function version(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args[0] === '-h') {
    console.log('Usage:');
    console.log('  bun run version [major|minor|patch]');
    console.log('  bun run version <x.x.x>');
    console.log('');
    console.log('Examples:');
    console.log('  bun run version          # 1.0.0 -> 1.0.1 (default: patch)');
    console.log('  bun run version patch    # 1.0.0 -> 1.0.1');
    console.log('  bun run version minor    # 1.0.0 -> 1.1.0');
    console.log('  bun run version major    # 1.0.0 -> 2.0.0');
    console.log('  bun run version 2.5.3    # Set to 2.5.3');
    process.exit(0);
  }

  const versionArg: string = args[0] ?? 'patch';

  try {
    await validateGitRepository(rootDir);

    const currentVersion: string = cliPackageJson.version;

    console.log(`📦 Current version: ${currentVersion}`);

    let newVersion: string;

    if (versionArg === 'major' || versionArg === 'minor' || versionArg === 'patch') {
      newVersion = bumpVersion(currentVersion, versionArg);
    } else {
      parseVersion(versionArg);
      newVersion = versionArg;
    }

    console.log(`🎯 New version: ${newVersion}`);

    await updatePackageJsonVersion(newVersion);
    await stageAndCommit(newVersion);
  } catch (error) {
    console.error('❌ Version update failed:', error);
    throw error;
  }
}

if (import.meta.main) {
  version().catch((error) => {
    console.error('❌ Version update process failed:', error);
    process.exit(1);
  });
}
