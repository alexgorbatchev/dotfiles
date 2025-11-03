#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import cliPackageJson from '../package.json';
import { cdToRepoRoot, executeCommand, printDirectoryContents, validateGitRepository } from './lib';

cdToRepoRoot(import.meta.url);

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, '.release');
const releaseBranchName = `release-${cliPackageJson.version}`;

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
  await executeCommand(['bun', 'run', 'build'], releaseDir, {
    DOTENV_VERSION: cliPackageJson.version,
  });
}

async function createOrphanedReleaseBranch(): Promise<void> {
  console.log(`🌿 Creating orphaned release branch: ${releaseBranchName}...`);

  // Create new orphaned branch with versioned name
  await executeCommand(['git', 'checkout', '--orphan', releaseBranchName], releaseDir);

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

  // Push to versioned release branch (force push since it's orphaned)
  await executeCommand(['git', 'push', '-f', 'origin', releaseBranchName], releaseDir);
}

async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up .release directory...');
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
}

async function showFinalReleaseBranchContents(): Promise<void> {
  console.log('📋 Final release branch contents:');
  try {
    const result = await $`git ls-tree -r --name-only ${releaseBranchName}`.quiet();
    const files = result.stdout
      .toString()
      .trim()
      .split('\n')
      .filter((f) => f);
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

async function checkReleaseBranchExists(): Promise<void> {
  console.log(`🔍 Checking if release branch ${releaseBranchName} already exists...`);

  // Check if versioned release branch already exists locally
  try {
    await executeCommand(['git', 'show-ref', '--verify', '--quiet', `refs/heads/${releaseBranchName}`], rootDir);
    console.error(
      `❌ Release branch '${releaseBranchName}' already exists locally. Please delete it first or bump the version.`
    );
    process.exit(1);
  } catch {
    // Branch doesn't exist locally which is what we want
  }

  // Check if versioned release branch already exists remotely
  try {
    await executeCommand(['git', 'ls-remote', '--exit-code', 'origin', `refs/heads/${releaseBranchName}`], rootDir);
    console.error(
      `❌ Release branch '${releaseBranchName}' already exists remotely. Please delete it first or bump the version.`
    );
    process.exit(1);
  } catch {
    // Branch doesn't exist remotely which is what we want
  }

  console.log(`✓ Release branch ${releaseBranchName} is available`);
}

export async function release(): Promise<void> {
  console.log('🚀 Starting release process...');

  try {
    // Step 0: Validate environment
    await validateGitRepository(rootDir);
    await validateCleanWorkingDirectory();

    // Step 1: Check if release branch already exists
    await checkReleaseBranchExists();

    // Step 2: Clean up any existing release directory
    await cleanupReleaseDir();

    // Step 3: Clone repository to .release
    await cloneRepository();

    // Step 4: Install dependencies
    await installDependencies();

    // Step 5: Run build script
    await runBuildScript();

    // Step 6: Create orphaned release branch
    await createOrphanedReleaseBranch();

    // Step 7: Move dist files to root
    await moveDistFiles();

    // Step 8: Remove build-only files
    await removeBuildOnlyFiles();

    // Step 9: List files before commit
    printDirectoryContents(releaseDir, 'Release directory contents');

    // Step 10: Commit and push
    await commitAndPush();

    console.log('✅ Release completed successfully! Use `bun run publish` now to publish.');
  } catch (error) {
    console.error('❌ Release failed:', error);
    throw error;
  }

  // Step 11: Clean up .release directory
  await cleanup();

  // Step 12: Show final release branch contents
  await showFinalReleaseBranchContents();
}

// Only run if executed directly
if (import.meta.main) {
  release().catch((error) => {
    console.error('❌ Release process failed:', error);
    process.exit(1);
  });
}
