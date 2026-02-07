/**
 * E2E Test Preload Script
 *
 * This script runs before any e2e tests and builds a minified CLI bundle.
 * Using a pre-built bundle instead of transpiling cli.ts on every invocation
 * reduces test execution time by ~50%.
 */
import { $ } from 'bun';
import fs from 'node:fs';
import path from 'node:path';

const E2E_DIST_DIR = '.e2e-dist';

/**
 * Check if we're running e2e tests by examining process arguments.
 */
function isE2ETestRun(): boolean {
  const args = process.argv.join(' ');
  return args.includes('e2e-test') || args.includes('packages/e2e-test');
}

/**
 * Build the CLI bundle for e2e tests.
 * Sets E2E_CLI_PATH environment variable for TestHarness to use.
 */
async function buildCliBundle(): Promise<void> {
  // Skip building if not running e2e tests
  if (!isE2ETestRun()) {
    return;
  }

  const projectRoot = findProjectRoot(import.meta.dir);
  const outdir = path.join(projectRoot, E2E_DIST_DIR);
  const entrypoint = path.join(projectRoot, 'cli.ts');
  const outputPath = path.join(outdir, 'cli.js');

  // Skip build if bundle already exists
  if (fs.existsSync(outputPath)) {
    process.env['E2E_CLI_PATH'] = outputPath;
    return;
  }

  // Build with NODE_ENV=production to ensure exitCli uses process.exit()
  // instead of throwing (which happens when NODE_ENV=test)
  const result = await $`NODE_ENV=production bun build ${entrypoint} --target=bun --minify --outdir ${outdir}`.quiet();

  if (result.exitCode !== 0) {
    console.error('Failed to build CLI bundle for e2e tests:');
    console.error(result.stderr.toString());
    process.exit(1);
  }

  // Set environment variable for TestHarness to use
  process.env['E2E_CLI_PATH'] = outputPath;
}

function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  for (;;) {
    const candidatePath = path.join(currentDir, 'cli.ts');
    if (Bun.file(candidatePath).size > 0) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('Unable to locate project root');
    }

    currentDir = parentDir;
  }
}

await buildCliBundle();
