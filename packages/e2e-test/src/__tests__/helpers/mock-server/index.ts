/**
 * Mock server for e2e tests.
 *
 * Provides mock endpoints for GitHub releases, Gitea/Forgejo releases, Cargo crates, and script downloads.
 * Configured via the MockServerBuilder - no side effects on import.
 */
import { afterAll, beforeAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { MockServerBuilder } from "./MockServerBuilder";
import type { IBinaryConfig, IGiteaToolConfig, IMockServerConfig, IScriptConfig, ITarConfig } from "./types";

/** Type for Bun.serve() return value */
type BunServer = ReturnType<typeof Bun.serve>;

/** Current server port (0 until server starts, then OS-assigned port) */
let currentServerPort = 0;

/**
 * Returns the current mock server port.
 * Call this after the server has started (in beforeAll or tests).
 */
export function getServerPort(): number {
  if (currentServerPort === 0) {
    throw new Error("Mock server not started yet. Call getServerPort() in beforeAll or test functions.");
  }
  return currentServerPort;
}

/**
 * Returns the current mock server port, or undefined if server not started.
 * Safe version that doesn't throw - useful for TestHarness.
 */
export function tryGetServerPort(): number | undefined {
  return currentServerPort === 0 ? undefined : currentServerPort;
}

/** Runtime state for version management (can be changed via /set-tool-version endpoint) */
const currentVersions: Map<string, string> = new Map();

/** Runtime state for Gitea tool version management */
const currentGiteaVersions: Map<string, string> = new Map();

/**
 * Creates a mock server with the given configuration.
 *
 * @param config - The server configuration from MockServerBuilder.build()
 * @param fixturesBasePath - Absolute path to the fixtures directory
 */
function createMockServer(config: IMockServerConfig, fixturesBasePath: string): BunServer {
  // Clear and reinitialize current versions from default versions
  currentVersions.clear();
  for (const tool of config.githubTools) {
    currentVersions.set(tool.repo, tool.defaultVersion);
  }

  currentGiteaVersions.clear();
  for (const tool of config.giteaTools) {
    currentGiteaVersions.set(tool.repo, tool.defaultVersion);
  }

  const server = Bun.serve({
    port: 0, // Let OS assign an available port
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Reset versions endpoint - resets all versions to defaults
      if (pathname === "/reset-versions") {
        currentVersions.clear();
        for (const tool of config.githubTools) {
          currentVersions.set(tool.repo, tool.defaultVersion);
        }
        currentGiteaVersions.clear();
        for (const tool of config.giteaTools) {
          currentGiteaVersions.set(tool.repo, tool.defaultVersion);
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Version management endpoint
      const setVersionMatch = pathname.match(/^\/set-tool-version\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (setVersionMatch) {
        const org = setVersionMatch[1] ?? "";
        const repo = setVersionMatch[2] ?? "";
        const version = setVersionMatch[3] ?? "";
        const fullRepo = `${org}/${repo}`;
        currentVersions.set(fullRepo, version);
        currentGiteaVersions.set(fullRepo, version);
        return new Response(JSON.stringify({ success: true, repo: fullRepo, version }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Gitea API: /api/v1/repos/:owner/:repo/releases/latest
      const giteaLatestMatch = pathname.match(/^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/);
      if (giteaLatestMatch) {
        const owner = giteaLatestMatch[1] ?? "";
        const repo = giteaLatestMatch[2] ?? "";
        const fullRepo = `${owner}/${repo}`;
        return handleGiteaLatestRelease(config, fixturesBasePath, fullRepo);
      }

      // Gitea API: /api/v1/repos/:owner/:repo/releases/tags/:tag
      const giteaTagMatch = pathname.match(/^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/releases\/tags\/([^/]+)$/);
      if (giteaTagMatch) {
        const owner = giteaTagMatch[1] ?? "";
        const repo = giteaTagMatch[2] ?? "";
        const tag = giteaTagMatch[3] ?? "";
        const fullRepo = `${owner}/${repo}`;
        return handleGiteaTagRelease(config, fixturesBasePath, fullRepo, tag);
      }

      // Gitea attachment download: /attachments/:uuid
      const giteaAttachmentMatch = pathname.match(/^\/attachments\/([^/]+)$/);
      if (giteaAttachmentMatch) {
        const uuid = giteaAttachmentMatch[1] ?? "";
        return handleGiteaAttachmentDownload(config, fixturesBasePath, uuid);
      }

      // GitHub API: /repos/:org/:repo/releases/latest
      const latestMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/);
      if (latestMatch) {
        const org = latestMatch[1] ?? "";
        const repo = latestMatch[2] ?? "";
        const fullRepo = `${org}/${repo}`;
        return handleGitHubLatestRelease(config, fixturesBasePath, fullRepo);
      }

      // GitHub API: /repos/:org/:repo/releases/tags/:tag
      const tagMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/tags\/([^/]+)$/);
      if (tagMatch) {
        const org = tagMatch[1] ?? "";
        const repo = tagMatch[2] ?? "";
        const tag = tagMatch[3] ?? "";
        const fullRepo = `${org}/${repo}`;
        return handleGitHubTagRelease(config, fixturesBasePath, fullRepo, tag);
      }

      // Cargo quickinstall binary download (GitHub releases format) - must be before generic GitHub download
      // Pattern: /cargo-bins/cargo-quickinstall/releases/download/{crate}-{version}/{crate}-{version}-{arch}-{platform}.tar.gz
      const quickinstallMatch = pathname.match(
        /^\/cargo-bins\/cargo-quickinstall\/releases\/download\/([^/]+)-([^/]+)\/([^/]+)\.tar\.gz$/,
      );
      if (quickinstallMatch) {
        const crateName = quickinstallMatch[1] ?? "";
        const filename = quickinstallMatch[3] ?? "";
        return handleCargoQuickinstall(config, fixturesBasePath, crateName, filename);
      }

      // GitHub binary download: /:org/:repo/releases/download/:version/:filename
      const downloadMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/);
      if (downloadMatch) {
        const org = downloadMatch[1] ?? "";
        const repo = downloadMatch[2] ?? "";
        const version = downloadMatch[3] ?? "";
        const filename = downloadMatch[4] ?? "";
        const fullRepo = `${org}/${repo}`;
        return handleGitHubDownload(config, fixturesBasePath, fullRepo, version, filename);
      }

      // Cargo API: /api/v1/crates/:crateName
      const cargoMatch = pathname.match(/^\/api\/v1\/crates\/([^/]+)$/);
      if (cargoMatch) {
        const crateName = cargoMatch[1] ?? "";
        return handleCargoCrate(config, crateName);
      }

      // Cargo Cargo.toml fetch (GitHub raw format: /:org/:repo/:branch/Cargo.toml)
      const cargoTomlMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/Cargo\.toml$/);
      if (cargoTomlMatch) {
        const repo = cargoTomlMatch[2] ?? "";
        // Find the matching cargo tool by crate name (repo name typically matches)
        const tool = config.cargoTools.find((t) => t.crateName === repo);
        if (tool) {
          return handleCargoToml(tool.crateName, tool.defaultVersion);
        }
        return new Response("Cargo.toml not found", { status: 404 });
      }

      // Static script endpoints
      for (const scriptConfig of config.scripts) {
        if (pathname === scriptConfig.path) {
          return handleScript(fixturesBasePath, scriptConfig);
        }
      }

      // Static tarball endpoints
      for (const tarConfig of config.tarballs) {
        if (pathname === tarConfig.path) {
          return handleTarball(fixturesBasePath, tarConfig);
        }
      }

      // Static binary file endpoints
      for (const binaryConfig of config.binaries) {
        if (pathname === binaryConfig.path) {
          return handleBinaryFile(fixturesBasePath, binaryConfig);
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  // Store the OS-assigned port
  currentServerPort = server.port ?? 0;
  return server;
}

// ============================================================================
// Route handlers
// ============================================================================

function handleGitHubLatestRelease(config: IMockServerConfig, _fixturesBasePath: string, fullRepo: string): Response {
  const tool = config.githubTools.find((t) => t.repo === fullRepo);
  if (!tool) {
    return new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const currentVersion = currentVersions.get(fullRepo) ?? tool.defaultVersion;
  const versionConfig = tool.versions.find((v) => v.version === currentVersion);
  if (!versionConfig) {
    return new Response(JSON.stringify({ message: "Version not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const assets = Object.entries(versionConfig.assets).map(([_pattern, filename]) => ({
    name: filename,
    browser_download_url: `http://127.0.0.1:${currentServerPort}/${fullRepo}/releases/download/${currentVersion}/${filename}`,
  }));

  return new Response(
    JSON.stringify({
      tag_name: currentVersion,
      assets,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function handleGitHubTagRelease(
  config: IMockServerConfig,
  _fixturesBasePath: string,
  fullRepo: string,
  tag: string,
): Response {
  const tool = config.githubTools.find((t) => t.repo === fullRepo);
  if (!tool) {
    return new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const versionConfig = tool.versions.find((v) => v.version === tag);
  if (!versionConfig) {
    return new Response(JSON.stringify({ message: "Tag not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const assets = Object.entries(versionConfig.assets).map(([_pattern, filename]) => ({
    name: filename,
    browser_download_url: `http://127.0.0.1:${currentServerPort}/${fullRepo}/releases/download/${tag}/${filename}`,
  }));

  return new Response(
    JSON.stringify({
      tag_name: tag,
      assets,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function handleGitHubDownload(
  config: IMockServerConfig,
  fixturesBasePath: string,
  fullRepo: string,
  _version: string,
  filename: string,
): Response {
  const tool = config.githubTools.find((t) => t.repo === fullRepo);
  if (!tool) {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = path.join(fixturesBasePath, tool.toolDir, filename);
  if (!fs.existsSync(filePath)) {
    return new Response(`File not found: ${filePath}`, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  return new Response(data, {
    headers: { "Content-Type": "application/gzip" },
  });
}

// ============================================================================
// Gitea/Forgejo route handlers
// ============================================================================

/**
 * Builds a Gitea-format release response with attachment-style download URLs.
 */
function buildGiteaReleaseResponse(tool: IGiteaToolConfig, version: string, assets: Record<string, string>): Response {
  let assetId = 1;
  const giteaAssets = Object.entries(assets).map(([_pattern, filename]) => {
    const uuid = `${tool.repo.replace("/", "-")}-${version}-${assetId}`;
    const asset = {
      id: assetId,
      name: filename,
      size: 1024,
      download_count: 42,
      created_at: "2025-01-01T00:00:00Z",
      uuid,
      browser_download_url: `http://127.0.0.1:${currentServerPort}/attachments/${uuid}`,
      type: "application/gzip",
    };
    assetId++;
    return asset;
  });

  return new Response(
    JSON.stringify({
      id: 1,
      tag_name: version,
      target_commitish: "main",
      name: `Release ${version}`,
      body: `Release notes for ${version}`,
      url: `http://127.0.0.1:${currentServerPort}/api/v1/repos/${tool.repo}/releases/1`,
      html_url: `http://127.0.0.1:${currentServerPort}/${tool.repo}/releases/tag/${version}`,
      tarball_url: `http://127.0.0.1:${currentServerPort}/${tool.repo}/archive/${version}.tar.gz`,
      zipball_url: `http://127.0.0.1:${currentServerPort}/${tool.repo}/archive/${version}.zip`,
      draft: false,
      prerelease: false,
      created_at: "2025-01-01T00:00:00Z",
      published_at: "2025-01-01T00:00:00Z",
      author: { id: 1, login: "test-user" },
      assets: giteaAssets,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function handleGiteaLatestRelease(config: IMockServerConfig, _fixturesBasePath: string, fullRepo: string): Response {
  const tool = config.giteaTools.find((t) => t.repo === fullRepo);
  if (!tool) {
    return new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const currentVersion = currentGiteaVersions.get(fullRepo) ?? tool.defaultVersion;
  const versionConfig = tool.versions.find((v) => v.version === currentVersion);
  if (!versionConfig) {
    return new Response(JSON.stringify({ message: "Version not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return buildGiteaReleaseResponse(tool, currentVersion, versionConfig.assets);
}

function handleGiteaTagRelease(
  config: IMockServerConfig,
  _fixturesBasePath: string,
  fullRepo: string,
  tag: string,
): Response {
  const tool = config.giteaTools.find((t) => t.repo === fullRepo);
  if (!tool) {
    return new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const versionConfig = tool.versions.find((v) => v.version === tag);
  if (!versionConfig) {
    return new Response(JSON.stringify({ message: "Tag not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return buildGiteaReleaseResponse(tool, tag, versionConfig.assets);
}

/**
 * Handles download via Gitea attachment UUID.
 * Maps the UUID back to the tool and asset filename to serve the fixture file.
 */
function handleGiteaAttachmentDownload(config: IMockServerConfig, fixturesBasePath: string, uuid: string): Response {
  // UUID format: {owner}-{repo}-{version}-{assetId}
  // We need to find the matching tool and asset
  for (const tool of config.giteaTools) {
    for (const versionConfig of tool.versions) {
      let assetId = 1;
      for (const [_pattern, filename] of Object.entries(versionConfig.assets)) {
        const expectedUuid = `${tool.repo.replace("/", "-")}-${versionConfig.version}-${assetId}`;
        if (expectedUuid === uuid) {
          const filePath = path.join(fixturesBasePath, tool.toolDir, filename);
          if (!fs.existsSync(filePath)) {
            return new Response(`File not found: ${filePath}`, { status: 404 });
          }
          const data = fs.readFileSync(filePath);
          return new Response(data, {
            headers: { "Content-Type": "application/gzip" },
          });
        }
        assetId++;
      }
    }
  }

  return new Response("Attachment not found", { status: 404 });
}

function handleCargoCrate(config: IMockServerConfig, crateName: string): Response {
  const tool = config.cargoTools.find((t) => t.crateName === crateName);
  if (!tool) {
    return new Response(JSON.stringify({ errors: [{ detail: "Not Found" }] }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const versions = Object.keys(tool.versions).map((version) => ({
    num: version,
    dl_path: `/api/v1/crates/${crateName}/${version}/download`,
  }));

  return new Response(
    JSON.stringify({
      crate: { name: crateName },
      versions,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function handleCargoToml(crateName: string, version: string): Response {
  const cargoToml = `[package]\nname = "${crateName}"\nversion = "${version}"\n`;
  return new Response(cargoToml, {
    headers: { "Content-Type": "text/plain" },
  });
}

function handleCargoQuickinstall(
  config: IMockServerConfig,
  fixturesBasePath: string,
  crateName: string,
  downloadFilename: string,
): Response {
  const tool = config.cargoTools.find((t) => t.crateName === crateName);
  if (!tool) {
    return new Response("Not Found", { status: 404 });
  }

  // downloadFilename is like "cargo-quickinstall-tool-1.0.0-aarch64-apple-darwin"
  // We need to find a fixture file that matches this target
  for (const versionAssets of Object.values(tool.versions)) {
    for (const [target, assetFilename] of Object.entries(versionAssets)) {
      // Check if the download filename contains this target
      if (downloadFilename.includes(target)) {
        const filePath = path.join(fixturesBasePath, tool.toolDir, assetFilename);
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath);
          return new Response(data, {
            headers: { "Content-Type": "application/gzip" },
          });
        }
      }
    }
  }

  return new Response("Not Found", { status: 404 });
}

function handleScript(fixturesBasePath: string, config: IScriptConfig): Response {
  const filePath = path.join(fixturesBasePath, config.fixturePath);
  if (!fs.existsSync(filePath)) {
    return new Response(`Script not found: ${filePath}`, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  return new Response(data, {
    headers: { "Content-Type": config.contentType ?? "application/x-sh" },
  });
}

function handleTarball(fixturesBasePath: string, config: ITarConfig): Response {
  const filePath = path.join(fixturesBasePath, config.fixturePath);
  if (!fs.existsSync(filePath)) {
    return new Response(`Tarball not found: ${filePath}`, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  return new Response(data, {
    headers: { "Content-Type": "application/gzip" },
  });
}

function handleBinaryFile(fixturesBasePath: string, config: IBinaryConfig): Response {
  const filePath = path.join(fixturesBasePath, config.fixturePath);
  if (!fs.existsSync(filePath)) {
    return new Response(`Binary not found: ${filePath}`, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  return new Response(data, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}

// ============================================================================
// Main export
// ============================================================================

/**
 * Sets up a mock server for e2e tests using the builder pattern.
 *
 * @param configure - Callback to configure the mock server
 * @param fixtureDir - Fixture directory relative to fixtures/ (default: 'main')
 *
 * @example
 * ```typescript
 * describe('E2E tests', () => {
 *   withMockServer((builder) => builder
 *     .withGitHubTool(GITHUB_RELEASE_TOOL)
 *     .withScript('/mock-install.sh', 'tools/my-tool/mock-install.sh')
 *   );
 *
 *   it('should work', async () => { ... });
 * });
 *
 * // With custom fixture directory
 * describe('Custom fixture tests', () => {
 *   withMockServer((builder) => builder.withGitHubTool(MY_TOOL), 'my-fixtures');
 *   // ...
 * });
 * ```
 */
export function withMockServer(
  configure?: (builder: MockServerBuilder) => MockServerBuilder,
  fixtureDir: string = "main",
): void {
  let server: BunServer | null = null;

  beforeAll(() => {
    // Determine fixtures path - look for fixtures directory relative to test file
    // Tests are in packages/e2e-test/src/__tests__/*.test.ts
    // Fixtures are in packages/e2e-test/src/__tests__/fixtures/
    // This file is in packages/e2e-test/src/__tests__/helpers/mock-server/
    const fixturesBasePath = path.join(__dirname, "..", "..", "fixtures");

    // Use provided fixture dir
    const builder = new MockServerBuilder(fixtureDir);
    const configuredBuilder = configure ? configure(builder) : builder;
    const config = configuredBuilder.build();

    // Resolve the full fixtures path
    const fullFixturesPath = path.join(fixturesBasePath, config.fixtureDir);

    server = createMockServer(config, fullFixturesPath);
  });

  afterAll(() => {
    if (server) {
      server.stop();
      server = null;
    }
    currentVersions.clear();
    currentGiteaVersions.clear();
    currentServerPort = 0;
  });
}

// Re-export builder and pre-configured tools
export { MockServerBuilder } from "./MockServerBuilder";
export {
  AUTO_INSTALL_TOOL,
  CARGO_QUICKINSTALL_TOOL,
  GITEA_RELEASE_TOOL,
  GITHUB_RELEASE_TOOL,
  HOOK_TEST_TOOL,
  INSTALL_BY_BINARY_TOOL,
} from "./MockServerBuilder";
export type {
  IBinaryConfig,
  ICargoToolConfig,
  IGiteaToolConfig,
  IGitHubToolConfig,
  IMockServerConfig,
  IScriptConfig,
  IVersionAssets,
} from "./types";
