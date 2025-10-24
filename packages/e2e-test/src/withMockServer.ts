import { afterEach, beforeEach } from 'bun:test';
import * as path from 'node:path';

const ASSET_NAMES_V1: string[] = [
  'github-release-tool-1.0.0-linux_amd64.tar.gz',
  'github-release-tool-1.0.0-macos_arm64.tar.gz',
];

const ASSET_NAMES_V2: string[] = [
  'github-release-tool-2.0.0-linux_amd64.tar.gz',
  'github-release-tool-2.0.0-macos_arm64.tar.gz',
];

const GITHUB_DEFAULTS: Record<string, Record<string, object>> = {
  'repo/github-release-tool': {
    '1.0.0': {
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      assets: ASSET_NAMES_V1.map((name) => ({
        name,
        browser_download_url: `http://localhost:8765/repo/github-release-tool/releases/download/v1.0.0/${name}`,
        content_type: 'application/gzip',
        size: 1024,
      })),
    },
    '2.0.0': {
      tag_name: 'v2.0.0',
      name: 'v2.0.0',
      assets: ASSET_NAMES_V2.map((name) => ({
        name,
        browser_download_url: `http://localhost:8765/repo/github-release-tool/releases/download/v2.0.0/${name}`,
        content_type: 'application/gzip',
        size: 1024,
      })),
    },
  },
};

const DEFAULT_VERSIONS: Record<string, string> = {
  'repo/github-release-tool': '1.0.0',
};

// Current version for each tool - mutable state that gets reset in afterEach
const currentVersions: Record<string, string> = {};

/**
 * Sets up a mock server on port 8765 with GitHub and Cargo API responses
 * Automatically handles beforeEach/afterEach setup and teardown for fresh state
 *
 * @returns The base URL of the mock server (http://localhost:8765)
 */
export function withMockServer(): void {
  let server: ReturnType<typeof Bun.serve> | null = null;

  beforeEach(async () => {
    Object.assign(currentVersions, { ...DEFAULT_VERSIONS });

    server = Bun.serve({
      port: 8765,
      routes: {
        // GitHub release API - returns version based on current setting
        '/repos/:org/:repo/releases/latest': (req) => {
          const toolKey = `${req.params.org}/${req.params.repo}`;
          const currentVersion = currentVersions[toolKey];
          const toolData = GITHUB_DEFAULTS[toolKey];
          if (toolData && currentVersion && toolData[currentVersion]) {
            return Response.json(toolData[currentVersion]);
          }
          return new Response('Version not found', { status: 404 });
        },

        '/set-tool-version/:org/:repo/:version': (req) => {
          const toolKey = `${req.params.org}/${req.params.repo}`;
          currentVersions[toolKey] = req.params.version;
          console.log(currentVersions);
          return new Response(`Set ${toolKey} to version ${req.params.version}`);
        },

        // GitHub binary downloads - dynamic org, repo, version and filename
        '/:org/:repo/releases/download/:version/:filename': (req) => {
          const mockBinaryPath = path.join(import.meta.dir, '__tests__', 'fixtures', req.params.filename);

          console.log(req.params.filename)
          return new Response(Bun.file(mockBinaryPath), {
            headers: {
              'Content-Disposition': `attachment; filename=${req.params.filename}`,
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
}
