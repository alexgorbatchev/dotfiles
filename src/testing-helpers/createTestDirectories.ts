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
  /** Optional map of additional directories to create (key: directory identifier, value: path relative to base directory) */
  additionalDirs?: Record<string, { path: string; relativeTo?: 'tempDir' | 'dotfilesDir' | 'generatedDir' | 'binariesDir' }>;
  /** Optional array of tool-specific directories to create in binaries directory */
  toolDirs?: string[];
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
  /** Map of additional directories created */
  additionalDirs: Record<string, string>;
  
  /**
   * Get an additional directory by key
   * @param key - The key of the additional directory
   * @returns The path to the additional directory
   * @throws Error if the directory doesn't exist
   */
  getDir(key: string): string;
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
    additionalDirs: {},
    
    // Helper method to get a directory with error checking
    getDir(key: string): string {
      const dir = this.additionalDirs[key];
      if (!dir) {
        throw new Error(`Additional directory '${key}' not found. Available keys: ${Object.keys(this.additionalDirs).join(', ')}`);
      }
      return dir;
    }
  };

  // Create additional directories if needed
  if (options.additionalDirs) {
    for (const [key, dirInfo] of Object.entries(options.additionalDirs)) {
      let baseDir: string;
      
      // Determine the base directory
      switch (dirInfo.relativeTo) {
        case 'dotfilesDir':
          baseDir = dotfilesDir;
          break;
        case 'generatedDir':
          baseDir = generatedDir;
          break;
        case 'binariesDir':
          baseDir = binariesDir;
          break;
        case 'tempDir':
        default:
          baseDir = tempDir;
          break;
      }
      
      const fullPath = path.join(baseDir, dirInfo.path);
      fs.mkdirSync(fullPath, { recursive: true });
      result.additionalDirs[key] = fullPath;
    }
  }

  // Create tool-specific directories in binaries directory if needed
  if (options.toolDirs && options.toolDirs.length > 0) {
    for (const toolDir of options.toolDirs) {
      fs.mkdirSync(path.join(binariesDir, toolDir), { recursive: true });
    }
  }

  return result;
}