import { afterEach, beforeEach } from 'bun:test';
import * as path from 'node:path';
import { dedentString } from '../../utils/src/dedentString';

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
 * Creates a Response object for binary file downloads from test fixtures.
 *
 * @param filename - The name of the binary file to serve from the fixtures directory.
 * @returns A Response object with the binary file content and appropriate headers.
 */
function createBinaryDownloadResponse(filename: string): Response {
  // Determine which tool directory based on filename
  let toolDir = '';
  if (filename.startsWith('github-release-tool')) {
    toolDir = 'tools/github-release-tool';
  } else if (filename.startsWith('cargo-quickinstall-tool')) {
    toolDir = 'tools/cargo-quickinstall-tool';
  }

  const mockBinaryPath = path.join(import.meta.dir, '__tests__', 'fixtures', toolDir, filename);
  return new Response(Bun.file(mockBinaryPath), {
    headers: {
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Type': 'application/gzip',
    },
  });
}

/**
 * Sets up a mock server on port 8765 that simulates GitHub and Cargo API responses.
 *
 * This function configures beforeEach and afterEach hooks to manage the mock server lifecycle.
 * The server provides mock endpoints for:
 * - GitHub releases API (latest and specific versions)
 * - Dynamic version control for testing updates
 * - Cargo crates.io API
 * - Binary downloads from test fixtures
 *
 * The server automatically resets to default versions between tests and cleans up on teardown.
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

        // GitHub release API - returns specific version by tag
        '/repos/:org/:repo/releases/tags/:tag': (req) => {
          const toolKey = `${req.params.org}/${req.params.repo}`;
          const tag = req.params.tag.replace(/^v/, ''); // Strip 'v' prefix if present
          const toolData = GITHUB_DEFAULTS[toolKey];
          if (toolData?.[tag]) {
            return Response.json(toolData[tag]);
          }
          return new Response('Version not found', { status: 404 });
        },

        '/set-tool-version/:org/:repo/:version': (req) => {
          const toolKey = `${req.params.org}/${req.params.repo}`;
          currentVersions[toolKey] = req.params.version;
          return new Response(`Set ${toolKey} to version ${req.params.version}`);
        },

        // Cargo crates.io API - returns crate metadata
        '/api/v1/crates/:crateName': (req) => {
          const crateName = req.params.crateName;
          return Response.json({
            crate: {
              id: crateName,
              name: crateName,
              newest_version: '1.0.0',
            },
          });
        },

        // Cargo.toml from GitHub raw
        '/:org/:repo/:branch/Cargo.toml': (req) => {
          const cargoToml = dedentString(`
            [package]
            name = "${req.params.repo}"
            version = "1.0.0"
            edition = "2021"
          `);
          return new Response(cargoToml, {
            headers: { 'Content-Type': 'text/plain' },
          });
        },

        // Cargo-quickinstall binary downloads
        '/cargo-bins/:org/releases/download/:crateName-:version/:filename': (req) =>
          createBinaryDownloadResponse(req.params.filename),

        // GitHub binary downloads - dynamic org, repo, version and filename
        '/:org/:repo/releases/download/:version/:filename': (req) => createBinaryDownloadResponse(req.params.filename),

        // Mock install script for cmd-based completion tests
        '/mock-install-for-cmd-completion-test.sh': () => {
          const scriptPath = path.join(
            import.meta.dir,
            '__tests__',
            'fixtures',
            'tools',
            'curl-script--cmd-completion-test',
            'mock-install-for-cmd-completion-test.sh'
          );
          return new Response(Bun.file(scriptPath), {
            headers: { 'Content-Type': 'application/x-sh' },
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
