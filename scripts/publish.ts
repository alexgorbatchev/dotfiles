#!/usr/bin/env bun

import cliPackageJson from '../package.json';
import { cdToRepoRoot, executeCommand, validateGitRepository } from './lib';

cdToRepoRoot(import.meta.url);

const releaseBranchName = `release-${cliPackageJson.version}`;

async function checkReleaseBranchExists(): Promise<void> {
  try {
    await executeCommand(['git', 'show-ref', '--verify', '--quiet', `refs/heads/${releaseBranchName}`]);
    console.log(`✓ Release branch ${releaseBranchName} exists locally`);
  } catch {
    throw new Error(`Release branch ${releaseBranchName} does not exist. Please run "bun run release" first to create it.`);
  }
}

async function pushReleaseBranch(): Promise<void> {
  console.log(`📤 Pushing release branch ${releaseBranchName} to origin...`);
  await executeCommand(['git', 'push', '-f', 'origin', releaseBranchName]);
  console.log(`✅ Release branch ${releaseBranchName} pushed successfully!`);
}

export async function publish(): Promise<void> {
  console.log('🚀 Starting publish process...');

  try {
    // Step 1: Validate environment
    await validateGitRepository();

    // Step 2: Check that release branch exists
    await checkReleaseBranchExists();

    // Step 3: Push release branch
    await pushReleaseBranch();

    console.log('✅ Publish completed successfully!');
    console.log('🌐 The release branch is now available on the remote repository');
  } catch (error) {
    console.error('❌ Publish failed:', error);
    throw error;
  }
}

// Only run if executed directly
if (import.meta.main) {
  publish().catch((error) => {
    console.error('❌ Publish process failed:', error);
    process.exit(1);
  });
}
