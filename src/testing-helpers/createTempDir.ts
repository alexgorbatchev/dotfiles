/**
 * @fileoverview Helper function for creating temporary directories for tests.
 */

import * as fs from 'node:fs';
import * as path from 'path';

/**
 * Creates a temporary directory for tests
 * @param name - The name of the temporary directory
 * @returns The path to the created temporary directory
 */
export function createTempDir(name: string) {
  const tempDir = path.join(__dirname, '../../__tests__/tmp', name);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}