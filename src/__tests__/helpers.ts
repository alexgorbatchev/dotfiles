/**
 * @fileoverview Helper functions for tests.
 */

import * as fs from 'node:fs';
import * as path from 'path';
import express from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';
import type { ConfigEnvironment } from '@modules/config';

/**
 * Creates a temporary directory for tests
 * @param name - The name of the temporary directory
 * @returns The path to the created temporary directory
 */
export function createTempDir(name: string) {
  const tempDir = path.join(__dirname, 'tmp', name);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Configuration for an API path in the mock GitHub server
 */
export interface MockApiPathConfig {
  /** The API path to mock (e.g., '/repos/owner/repo/releases/latest') */
  path: string;
  /** The JSON response to return */
  response: unknown;
}

/**
 * Configuration for a binary path in the mock GitHub server
 */
export interface MockBinaryPathConfig {
  /** The path to the binary file (e.g., '/owner/repo/releases/download/v1.0.0/tool-linux-amd64') */
  path: string;
  /** The path to the local file to serve as the binary response */
  filePath: string;
}

/**
 * Configuration for the mock GitHub server
 */
export interface MockGitHubServerConfig {
  /** API paths that return JSON responses */
  apiPaths?: MockApiPathConfig[];
  /** Binary paths that return binary file contents */
  binaryPaths?: MockBinaryPathConfig[];
}

/**
 * Result of setting up a mock GitHub server
 */
export interface MockGitHubServerResult {
  /** The Express server instance */
  server: Server;
  /** The base URL of the server (e.g., 'http://localhost:3000') */
  baseUrl: string;
}

/**
 * Sets up a mock GitHub API server using Express
 *
 * @param config - Configuration for the mock GitHub server
 * @returns A promise that resolves to the server instance and base URL
 *
 * @example
 * ```typescript
 * const { server, baseUrl } = await setupMockGitHubServer({
 *   apiPaths: [
 *     {
 *       path: '/repos/owner/repo/releases/latest',
 *       response: { tag_name: 'v1.0.0', assets: [...] }
 *     }
 *   ],
 *   binaryPaths: [
 *     {
 *       path: '/owner/repo/releases/download/v1.0.0/tool-linux-amd64',
 *       filePath: './path/to/mock/binary'
 *     }
 *   ]
 * });
 *
 * // Use in tests with baseUrl as the GitHub API URL
 * // ...
 *
 * // Cleanup when done
 * await new Promise<void>((resolve) => server.close(() => resolve()));
 * ```
 */
export async function setupMockGitHubServer(
  config: MockGitHubServerConfig
): Promise<MockGitHubServerResult> {
  const app: Express = express();

  // Configure API paths that return JSON responses
  if (config.apiPaths) {
    for (const apiPath of config.apiPaths) {
      app.get(apiPath.path, function (_req, res) {
        res.json(apiPath.response);
      });
    }
  }

  // Configure binary paths that return binary file contents
  if (config.binaryPaths) {
    for (const binaryPath of config.binaryPaths) {
      app.get(binaryPath.path, function (_req, res) {
        // Check if the file exists
        if (!fs.existsSync(binaryPath.filePath)) {
          res.status(404).send(`File not found: ${binaryPath.filePath}`);
          return;
        }

        // Set appropriate headers for binary download
        const filename = path.basename(binaryPath.path);
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', 'application/octet-stream');

        // Stream the file to the response
        const fileStream = fs.createReadStream(binaryPath.filePath);
        fileStream.pipe(res);
      });
    }
  }

  // Start the server on a random available port
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to get server address');
      }

      const baseUrl = `http://localhost:${address.port}`;
      resolve({ server, baseUrl });
    });
  });
}

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

/**
 * Options for executing a CLI command
 */
export interface CliCommandOptions {
  /** CLI command and arguments */
  command: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Optional current working directory */
  cwd?: string;
  /** Optional additional environment variables */
  additionalEnv?: Record<string, string>;
  /** Optional home directory */
  homeDir?: string;
  /** Optional custom command to use instead of the CLI entry point */
  customCmd?: string[];
}

/**
 * Result of executing a CLI command
 */
export interface CliCommandResult {
  /** Exit code of the command */
  exitCode: number | null;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Executes a CLI command using Bun.spawnSync
 *
 * @param options - Options for executing the command
 * @returns Result of the command execution
 */
export function executeCliCommand(options: CliCommandOptions): CliCommandResult {
  const { command, env, additionalEnv = {}, cwd, homeDir, customCmd } = options;

  // Prepare environment variables
  const execEnv: Record<string, string> = {
    ...env,
    ...additionalEnv,
    PATH: process.env['PATH'] || '',
  };

  // Add HOME if provided
  if (homeDir) {
    execEnv['HOME'] = homeDir;
  }

  let cmd: string[];
  let execCwd: string;

  if (customCmd) {
    // Use custom command if provided
    cmd = [...customCmd, ...command];
    execCwd = cwd || process.cwd();
  } else {
    // Find CLI entry point
    const generatorProjectRootPath = path.resolve(__dirname, '../../../generator');
    const cliEntryPoint = path.join(generatorProjectRootPath, 'src', 'cli.ts');
    cmd = ['bun', cliEntryPoint, ...command];
    execCwd = cwd || generatorProjectRootPath;
  }

  // Execute command
  const proc = Bun.spawnSync({
    cmd,
    cwd: execCwd,
    env: execEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/**
 * Options for creating a tool configuration
 */
export interface ToolConfigOptions {
  /** Directory to create tool config in */
  toolConfigsDir: string;
  /** Tool name */
  name: string;
  /** Tool config content */
  content: string;
}

/**
 * Creates a tool configuration file
 *
 * @param options - Options for creating the tool config
 * @returns Path to the created config file
 */
export function createToolConfig(options: ToolConfigOptions): string {
  const { toolConfigsDir, name, content } = options;

  // Create tool config file
  const configPath = path.join(toolConfigsDir, `${name}.tool.ts`);
  fs.writeFileSync(configPath, content);

  return configPath;
}
