#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import cliPackageJson from '../package.json';
import { cdToRepoRoot, executeCommand, validateGitRepository } from './lib';

cdToRepoRoot(import.meta.url);

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');

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

async function updatePackageJsonVersion(newVersion: string): Promise<void> {
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`✓ Updated package.json to version ${newVersion}`);
}

async function stageAndCommit(version: string): Promise<void> {
  console.log('📝 Staging package.json...');
  await executeCommand(['git', 'add', 'package.json'], rootDir);

  console.log('💾 Creating commit...');
  await executeCommand(['git', 'commit', '-m', `Version ${version}`], rootDir);

  console.log(`✅ Committed version ${version}`);
}

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
