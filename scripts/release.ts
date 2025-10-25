#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, '.release');

async function validateGitRepository(): Promise<void> {
  try {
    const args = ['rev-parse', '--git-dir'];
    const result = await $`git ${args}`.cwd(rootDir).quiet();
    if (result.exitCode !== 0) {
      throw new Error('Not a git repository');
    }
    console.log('✓ Confirmed we are in a git repository');
  } catch {
    throw new Error('Not in a git repository. Please run this script from the project root.');
  }
}

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

async function executeCommand(args: string[], cwd: string = process.cwd()): Promise<void> {
  const command = args.join(' ');
  console.log(`🔧 Running: ${command}`);
  const result = await $`${args}`.cwd(cwd).quiet();

  if (result.exitCode !== 0) {
    console.error(`❌ Command failed: ${command}`);
    console.error(`Exit code: ${result.exitCode}`);
    console.error(`Error output: ${result.stderr.toString()}`);
    throw new Error(`Command failed with exit code ${result.exitCode}`);
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
  
  // Remove .npmrc after installation to avoid including it in the release
  const releaseNpmrcPath = path.join(releaseDir, '.npmrc');
  if (fs.existsSync(releaseNpmrcPath)) {
    fs.unlinkSync(releaseNpmrcPath);
    console.log('✓ Removed .npmrc after dependency installation');
  }
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

  // Copy all files from .dist to root of release branch
  const distFiles = fs.readdirSync(releaseDistDir);
  for (const file of distFiles) {
    const srcPath = path.join(releaseDistDir, file);
    const destPath = path.join(releaseDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`   ✓ Moved ${file}`);
  }

  // Remove the .dist directory
  fs.rmSync(releaseDistDir, { recursive: true, force: true });
}

async function commitAndPush(): Promise<void> {
  console.log('💾 Committing and pushing release...');

  // Add all files
  await executeCommand(['git', 'add', '.'], releaseDir);

  // Get version from package.json for commit message
  const packageJsonPath = path.join(releaseDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;

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
    await validateGitRepository();
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

    // Step 7: Commit and push
    await commitAndPush();

    console.log('✅ Release completed successfully!');
  } catch (error) {
    console.error('❌ Release failed:', error);
    throw error;
  } finally {
    // Step 8: Clean up .release directory
    await cleanup();
  }
}

// Only run if executed directly
if (import.meta.main) {
  release().catch((error) => {
    console.error('❌ Release process failed:', error);
    process.exit(1);
  });
}
