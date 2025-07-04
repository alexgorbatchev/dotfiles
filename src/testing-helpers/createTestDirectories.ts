/**
 * @fileoverview Helper functions for creating test directory structures.
 */

import * as fs from 'node:fs';
import * as path from 'path';
import { createTempDir } from './createTempDir';

/**
 * Options for creating test directories
 */
export interface TestDirectoryOptions {
  /** Name for the temporary directory */
  testName: string;
  /** Optional flag to create additional directories */
  createLazygitConfigDir?: boolean;
}

/**
 * Structure containing paths to test directories
 */
export interface TestDirectories {
  /** Root temporary directory */
  tempDir: string;
  /** Dotfiles repository directory */
  dotfilesDir: string;
  /** Generated files directory */
  generatedDir: string;
  /** Tool configs directory */
  toolConfigsDir: string;
  /** Binaries directory */
  binariesDir: string;
  /** Bin directory for symlinks */
  binDir: string;
  /** Path to lazygit config directory (if created) */
  lazygitConfigDir?: string;
}

/**
 * Creates a standard directory structure for E2E tests
 *
 * @param options - Options for creating test directories
 * @returns Object containing paths to created directories
 */
export function createTestDirectories(options: TestDirectoryOptions): TestDirectories {
  const tempDir = createTempDir(options.testName);
  const dotfilesDir = path.join(tempDir, 'my-dotfiles-repo');
  const generatedDir = path.join(dotfilesDir, '.generated');
  const toolConfigsDir = path.join(dotfilesDir, 'actual-tool-configs');
  const binariesDir = path.join(generatedDir, 'binaries');
  const binDir = path.join(generatedDir, 'bin');

  // Create standard directories
  fs.mkdirSync(dotfilesDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(toolConfigsDir, { recursive: true });
  fs.mkdirSync(binariesDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const result: TestDirectories = {
    tempDir,
    dotfilesDir,
    generatedDir,
    toolConfigsDir,
    binariesDir,
    binDir,
  };

  // Create additional directories if needed
  if (options.createLazygitConfigDir) {
    const lazygitConfigDir = path.join(dotfilesDir, '02-configs', 'lazygit');
    fs.mkdirSync(lazygitConfigDir, { recursive: true });
    result.lazygitConfigDir = lazygitConfigDir;
  }

  return result;
}