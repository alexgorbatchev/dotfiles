#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import cliPackageJson from '../package.json';
import { cdToRepoRoot, executeCommand, validateGitRepository, printDirectoryContents } from './lib';

cdToRepoRoot(import.meta.url);

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, '.release');

async function validateCleanWorkingDirectory(): Promise<void> {
  try {
    const result = await $`git status --porcelain`.cwd(rootDir).quiet();
    if (result.stdout.toString().trim() !== '') {
      console.warn('⚠️  Warning: Working directory has uncommitted changes');
      console.warn('   This may affect the release if the build depends on uncommitted files');
    }
  } catch {
    // If git status fails, we'll catch it in other validations
  }
}

async function cleanupReleaseDir(): Promise<void> {
  if (fs.existsSync(releaseDir)) {
    console.log('🧹 Cleaning up existing .release directory...');
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
}

async function cloneRepository(): Promise<void> {
  console.log('📂 Cloning repository to .release...');
  await executeCommand(['git', 'clone', '.', releaseDir], rootDir);

  // Copy .npmrc if it exists in the root
  const npmrcPath = path.join(rootDir, '.npmrc');
  if (fs.existsSync(npmrcPath)) {
    const releaseNpmrcPath = path.join(releaseDir, '.npmrc');
    fs.copyFileSync(npmrcPath, releaseNpmrcPath);
    console.log('✓ Copied .npmrc to release directory');
  }
}

async function installDependencies(): Promise<void> {
  console.log('📦 Installing dependencies...');
  await executeCommand(['bun', 'install'], releaseDir);
}

async function runBuildScript(): Promise<void> {
  console.log('🏗️  Running build script...');
  await executeCommand(['bun', 'run', 'build'], releaseDir);
}

async function createOrphanedReleaseBranch(): Promise<void> {
  console.log('🌿 Creating orphaned release branch...');

  // Check if release branch exists and delete it
  try {
    await executeCommand(['git', 'show-ref', '--verify', '--quiet', 'refs/heads/release'], releaseDir);
    console.log('🗑️  Deleting existing release branch...');
    await executeCommand(['git', 'branch', '-D', 'release'], releaseDir);
  } catch {
    // Branch doesn't exist, that's fine
  }

  // Create new orphaned branch
  await executeCommand(['git', 'checkout', '--orphan', 'release'], releaseDir);

  // Remove all files from staging
  await executeCommand(['git', 'rm', '-rf', '.'], releaseDir);
}

async function moveDistFiles(): Promise<void> {
  console.log('📁 Moving build files to release branch...');
  const releaseDistDir = path.join(releaseDir, '.dist');

  if (!fs.existsSync(releaseDistDir)) {
    throw new Error('Build files not found in .release/.dist');
  }

  // Only copy essential release files (exclude .npmrc, bun.lock, etc.)
  const allowedFiles = ['cli.js', 'cli.js.map', 'package.json', 'schemas.d.ts'];
  
  const distFiles = fs.readdirSync(releaseDistDir);
  for (const file of distFiles) {
    if (allowedFiles.includes(file)) {
      const srcPath = path.join(releaseDistDir, file);
      const destPath = path.join(releaseDir, file);
      fs.copyFileSync(srcPath, destPath);
      console.log(`   ✓ Moved ${file}`);
    } else {
      console.log(`   ⏭️  Skipped ${file} (not included in release)`);
    }
  }

  // Remove the .dist directory
  fs.rmSync(releaseDistDir, { recursive: true, force: true });
}

async function removeBuildOnlyFiles(): Promise<void> {
  console.log('🧹 Removing build-only files from release directory...');
  
  const releaseNpmrcPath = path.join(releaseDir, '.npmrc');
  if (fs.existsSync(releaseNpmrcPath)) {
    fs.unlinkSync(releaseNpmrcPath);
    console.log('   ✓ Removed .npmrc');
  }
}

async function commitAndPush(): Promise<void> {
  console.log('💾 Committing and pushing release...');

  // Add all files
  await executeCommand(['git', 'add', '.'], releaseDir);

  // Get version from imported package.json for commit message
  const version = cliPackageJson.version;

  // Commit with version info
  await executeCommand(['git', 'commit', '-m', `Release v${version}`], releaseDir);

  // Push to release branch (force push since it's orphaned)
  await executeCommand(['git', 'push', '-f', 'origin', 'release'], releaseDir);
}

async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up .release directory...');
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
}

export async function release(): Promise<void> {
  console.log('🚀 Starting release process...');

  try {
    // Step 0: Validate environment
    await validateGitRepository(rootDir);
    await validateCleanWorkingDirectory();

    // Step 1: Clean up any existing release directory
    await cleanupReleaseDir();

    // Step 2: Clone repository to .release
    await cloneRepository();

    // Step 3: Install dependencies
    await installDependencies();

    // Step 4: Run build script
    await runBuildScript();

    // Step 5: Create orphaned release branch
    await createOrphanedReleaseBranch();

    // Step 6: Move dist files to root
    await moveDistFiles();

    // Step 7: Remove build-only files
    await removeBuildOnlyFiles();

    // Step 8: List files before commit
    printDirectoryContents(releaseDir, 'Release directory contents');

    // Step 9: Commit and push
    await commitAndPush();

    console.log('✅ Release completed successfully! Use `bun run publish` now to publish.');
  } catch (error) {
    console.error('❌ Release failed:', error);
    throw error;
  }

  // Step 10: Clean up .release directory
  await cleanup();

  // Step 11: Show final release branch contents
  console.log('📋 Final release branch contents:');
  try {
    const result = await $`git ls-tree -r --name-only release`.quiet();
    const files = result.stdout.toString().trim().split('\n').filter(f => f);
    if (files.length > 0) {
      for (const file of files) {
        console.log(`   📄 ${file}`);
      }
    } else {
      console.log('   (no files)');
    }
  } catch {
    console.log('   ❌ Could not list release branch files');
  }
}

// Only run if executed directly
if (import.meta.main) {
  release().catch((error) => {
    console.error('❌ Release process failed:', error);
    process.exit(1);
  });
}
