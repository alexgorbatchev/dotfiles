#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import cliPackageJson from '../package.json';
import { cdToRepoRoot, executeCommand } from './lib';

cdToRepoRoot(import.meta.url);

const rootDir = process.cwd();
const distDir = path.join(rootDir, '.dist');

async function runBuildScript(): Promise<void> {
  console.log('🏗️  Running build script...');
  await executeCommand(['bun', 'run', 'build'], {
    env: { DOTENV_VERSION: cliPackageJson.version },
  });
}

async function showDistContents(): Promise<void> {
  console.log('� Build output files:');
  if (!fs.existsSync(distDir)) {
    console.log('   ❌ No .dist directory found');
    return;
  }

  const files = fs.readdirSync(distDir);
  for (const file of files.sort()) {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      console.log(`   📄 ${file}`);
    }
  }
}

export async function release(): Promise<void> {
  console.log('🚀 Starting release process...');

  try {
    // Step 1: Run build script
    await runBuildScript();

    // Step 2: Show dist contents
    await showDistContents();

    console.log('✅ Release completed successfully! Use `bun run publish` now to publish.');
  } catch (error) {
    console.error('❌ Release failed:', error);
    throw error;
  }
}

// Only run if executed directly
if (import.meta.main) {
  release().catch((error) => {
    console.error('❌ Release process failed:', error);
    process.exit(1);
  });
}
