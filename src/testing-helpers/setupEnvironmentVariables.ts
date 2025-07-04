/**
 * @fileoverview Helper functions for setting up environment variables for tests.
 */

import * as path from 'path';
import type { ConfigEnvironment } from '@modules/config';
import type { TestDirectories } from './createTestDirectories';

/**
 * Options for setting up environment variables
 */
export interface EnvironmentOptions {
  /** Test directories from createTestDirectories */
  directories: TestDirectories;
  /** Optional additional environment variables */
  additionalEnv?: Record<string, string>;
  /** Optional mock server base URL */
  mockServerBaseUrl?: string;
}

/**
 * Sets up standard environment variables for E2E tests
 *
 * @param options - Options for environment setup
 * @returns Environment variables for CLI execution
 */
export function setupEnvironmentVariables(options: EnvironmentOptions): ConfigEnvironment {
  const { directories, additionalEnv = {}, mockServerBaseUrl } = options;

  // Create manifest path
  const manifestPath = path.join(directories.generatedDir, 'generated-manifest.json');

  // Set up standard environment variables
  const envVars: ConfigEnvironment = {
    DOTFILES_DIR: directories.dotfilesDir,
    GENERATED_DIR: directories.generatedDir,
    TOOL_CONFIGS_DIR: directories.toolConfigsDir,
    TARGET_DIR: directories.binDir,
    GENERATED_ARTIFACTS_MANIFEST_PATH: manifestPath,
    DEBUG: process.env['DEBUG'] || 'true',
    CACHE_ENABLED: 'false',
    GITHUB_API_CACHE_ENABLED: 'false',
    CHECK_UPDATES_ON_RUN: 'false',
    ...additionalEnv,
  };

  // Add mock server URL if provided
  if (mockServerBaseUrl) {
    envVars.GITHUB_HOST = mockServerBaseUrl;
  }

  return envVars;
}