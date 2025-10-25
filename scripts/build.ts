#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import cliPackageJson from '../package.json';
import { cdToRepoRoot } from './lib';

cdToRepoRoot(import.meta.url);

const outputDir = path.resolve(process.cwd(), '.dist');
const outputFile = path.join(outputDir, 'cli.js');
const entryPoint = path.resolve(process.cwd(), 'packages/cli/src/main.ts');

console.log('🏗️  Building CLI...');
console.log(`📍 Entry: ${entryPoint}`);
console.log(`📦 Output: ${outputFile}`);

// Clean up previous build
if (fs.existsSync(outputDir)) {
  console.log('🧹 Cleaning previous build...');
  fs.rmSync(outputDir, { recursive: true, force: true });
}

try {
  process.env['DOTFILES_VERSION'] = cliPackageJson.version;

  const result = await Bun.build({
    entrypoints: [entryPoint],
    outdir: outputDir,
    naming: 'cli.js',
    minify: true,
    sourcemap: 'external',
    target: 'bun',
    format: 'esm',
    splitting: false,
    define: {
      'import.meta.main': 'true',
    },
    env: 'DOTFILES_*',
  });

  if (result.success) {
    // Make cli.js executable
    fs.chmodSync(outputFile, 0o755);

    // Generate package.json for the built CLI
    const packageJson = {
      name: 'dotfiles',
      version: cliPackageJson.version,
      type: 'module',
      bin: {
        dotfiles: './cli.js',
      },
    };

    const packageJsonPath = path.join(outputDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    console.log('✅ Build completed successfully!');
    console.log(`📁 Output directory: ${outputDir}`);
    console.log(`🗂️  Generated files:`);

    for (const output of result.outputs) {
      const relativePath = path.relative(process.cwd(), output.path);
      console.log(`   - ${relativePath}`);
    }

    // Also show the generated package.json
    const packageJsonRelative = path.relative(process.cwd(), packageJsonPath);
    console.log(`   - ${packageJsonRelative}`);

    // Test the built CLI
    console.log('🧪 Testing built CLI...');
    try {
      const testResult = await $`bun ${outputFile} --version`.quiet();

      if (testResult.exitCode === 0) {
        console.log(`✅ CLI test passed - version: ${testResult.stdout.toString().trim()}`);
      } else {
        console.error('❌ CLI test failed with exit code:', testResult.exitCode);
        console.error('Error output:', testResult.stderr.toString());
        process.exit(1);
      }
    } catch (testError) {
      console.error('❌ CLI test failed:', testError);
      process.exit(1);
    }
  } else {
    console.error('❌ Build failed:');
    for (const message of result.logs) {
      console.error(`   ${message}`);
    }
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Build error:', error);
  process.exit(1);
}
