import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds the project root by traversing upward looking for cli.ts
 */
export function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  for (;;) {
    const candidatePath = path.join(currentDir, 'cli.ts');
    if (fs.existsSync(candidatePath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('Unable to locate project root. Expected to find cli.ts while traversing upwards.');
    }

    currentDir = parentDir;
  }
}

/**
 * Gets the generated directory path for e2e tests.
 * Uses tmp/e2e-test/worker-{id}/{fixture-name}/ for parallel test isolation.
 *
 * @param configDir - The directory containing the config file (import.meta.dirname)
 * @returns Absolute path to the generated directory
 */
export function getE2eGeneratedDir(configDir: string): string {
  const projectRoot = findProjectRoot(configDir);
  const fixtureName = path.basename(configDir);
  const workerId = process.env['BUN_TEST_WORKER_ID'] || 'default';

  return path.join(projectRoot, 'tmp', 'e2e-test', `worker-${workerId}`, fixtureName);
}
