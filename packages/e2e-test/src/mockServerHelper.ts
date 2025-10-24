import { afterEach, beforeEach } from 'bun:test';
import * as path from 'node:path';

/**
 * Sets up a mock server on port 8765 with GitHub and Cargo API responses
 * Automatically handles beforeEach/afterEach setup and teardown for fresh state
 *
 * @returns The base URL of the mock server (http://localhost:8765)
 */
export function setupMockServer(): string {
  let server: ReturnType<typeof Bun.serve> | null = null;
  const baseUrl = 'http://localhost:8765';

  // Tool versions configuration - static data
  const toolVersions: Record<string, Record<string, object>> = {
    'repo/github-release-tool': {
      '1.0.0': {
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        assets: [
          { name: 'github-release-tool-1.0.0-linux_amd64.tar.gz', platform: 'linux_amd64' },
          { name: 'github-release-tool-1.0.0-macos_arm64.tar.gz', platform: 'macos_arm64' },
        ].map((asset) => ({
          name: asset.name,
          browser_download_url: `http://localhost:8765/repo/github-release-tool/releases/download/v1.0.0/${asset.name}`,
          content_type: 'application/gzip',
          size: 1024,
        })),
      },
      '2.0.0': {
        tag_name: 'v2.0.0',
        name: 'v2.0.0',
        assets: [
          { name: 'github-release-tool-2.0.0-linux_amd64.tar.gz', platform: 'linux_amd64' },
          { name: 'github-release-tool-2.0.0-macos_arm64.tar.gz', platform: 'macos_arm64' },
        ].map((asset) => ({
          name: asset.name,
          browser_download_url: `http://localhost:8765/repo/github-release-tool/releases/download/v2.0.0/${asset.name}`,
          content_type: 'application/gzip',
          size: 1024,
        })),
      },
    },
  };

  beforeEach(async () => {
    // Current version for each tool - shared between route handlers
    const currentVersions: Record<string, string> = {
      'repo/github-release-tool': '1.0.0', // Default current version
    };

    server = Bun.serve({
      port: 8765,
      routes: {
        // GitHub release API - returns version based on current setting
        '/repos/:org/:repo/releases/latest': (req) => {
          const org = req.params.org;
          const repo = req.params.repo;
          const toolKey = `${org}/${repo}`;

          const currentVersion = currentVersions[toolKey];
          const toolData = toolVersions[toolKey];
          console.log(`[MOCK] GET /repos/${org}/${repo}/releases/latest - current version: ${currentVersion}`);
          if (toolData && currentVersion && toolData[currentVersion]) {
            const releaseData = toolData[currentVersion];
            return Response.json(releaseData);
          }
          return new Response('Version not found', { status: 404 });
        },

        // Endpoint to set tool version
        '/set-tool-version/:org/:repo/:version': (req) => {
          const org = req.params.org;
          const repo = req.params.repo;
          const version = req.params.version;
          const toolKey = `${org}/${repo}`;
          console.log(`[MOCK] Setting ${toolKey} to version ${version}`);
          currentVersions[toolKey] = version;
          console.log(`[MOCK] Current versions state:`, currentVersions);
          return new Response(`Set ${toolKey} to version ${version}`);
        },

        // GitHub binary downloads - dynamic org, repo, version and filename
        '/:org/:repo/releases/download/:version/:filename': (req) => {
          const filename = req.params.filename;
          const mockBinaryPath = path.join(import.meta.dir, '__tests__', 'fixtures', filename);

          const file = Bun.file(mockBinaryPath);
          return new Response(file, {
            headers: {
              'Content-Disposition': `attachment; filename=${filename}`,
              'Content-Type': 'application/gzip',
            },
          });
        },
      },
      fetch() {
        return new Response('Not Found', { status: 404 });
      },
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  return baseUrl;
}
