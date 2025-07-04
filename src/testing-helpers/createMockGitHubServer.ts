/**
 * @fileoverview Helper functions for mocking GitHub API server in tests.
 */

import * as fs from 'node:fs';
import * as path from 'path';
import express from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';

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
  /** Closes the server and releases resources */
  close(): Promise<void>;
}

/**
 * Sets up a mock GitHub API server using Express
 *
 * @param config - Configuration for the mock GitHub server
 * @returns A promise that resolves to the server instance and base URL
 *
 * @example
 * ```typescript
 * const { server, baseUrl } = await createMockGitHubServer({
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
 * await mockServer.close();
 * ```
 */
export async function createMockGitHubServer(
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
      
      // Add close method to simplify server cleanup
      const close = async (): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          if (server) {
            server.close((err?: Error) => (err ? reject(err) : resolve()));
          } else {
            resolve();
          }
        });
      };
      
      resolve({ server, baseUrl, close });
    });
  });
}