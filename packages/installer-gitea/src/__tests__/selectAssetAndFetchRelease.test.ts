import {
  Architecture,
  type IGitHubRelease,
  type IGitHubReleaseAsset,
  type IInstallContext,
  Platform,
} from "@dotfiles/core";
import type { GiteaReleaseInstallParams } from "@dotfiles/installer-gitea";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import type { IGiteaApiClient } from "../gitea-client";
import { fetchGiteaRelease, selectAsset } from "../installFromGiteaRelease";

function createMockAsset(name: string): IGitHubReleaseAsset {
  const asset: IGitHubReleaseAsset = {
    name,
    content_type: "application/gzip",
    size: 1024,
    download_count: 100,
    browser_download_url: `https://codeberg.org/owner/repo/releases/download/v1.0.0/${name}`,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    state: "uploaded",
  };
  return asset;
}

function createMockRelease(tagName: string, assets: IGitHubReleaseAsset[] = []): IGitHubRelease {
  const release: IGitHubRelease = {
    id: 1,
    tag_name: tagName,
    name: `Release ${tagName}`,
    draft: false,
    prerelease: false,
    created_at: "2024-01-01T00:00:00Z",
    published_at: "2024-01-01T00:00:00Z",
    assets,
    html_url: `https://codeberg.org/owner/repo/releases/tag/${tagName}`,
  };
  return release;
}

function createMockGiteaApiClient(): IGiteaApiClient {
  const client: IGiteaApiClient = {
    getLatestRelease: mock(async () => null),
    getReleaseByTag: mock(async () => null),
    getAllReleases: mock(async () => []),
    getLatestReleaseTags: mock(async () => []),
  };
  return client;
}

function createMacOSArm64Context(): IInstallContext {
  return {
    toolName: "test-tool",
    currentDir: "/path/to/tools/test-tool",
    stagingDir: "/path/to/tools/test-tool/.staging",
    systemInfo: {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: "/Users/test",
      hostname: "test-host",
    },
  } as IInstallContext;
}

function createLinuxX64Context(): IInstallContext {
  return {
    toolName: "test-tool",
    currentDir: "/path/to/tools/test-tool",
    stagingDir: "/path/to/tools/test-tool/.staging",
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      hostname: "test-host",
    },
  } as IInstallContext;
}

describe("fetchGiteaRelease", () => {
  let logger: TestLogger;
  let apiClient: IGiteaApiClient;

  beforeEach(() => {
    logger = new TestLogger();
    apiClient = createMockGiteaApiClient();
  });

  describe("invalid repo format", () => {
    it("should return error for repo without slash", async () => {
      const result = await fetchGiteaRelease("invalid-repo", "latest", false, apiClient, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(
        `"Invalid repository format: invalid-repo. Expected format: owner/repo"`,
      );
    });
  });

  describe("latest version", () => {
    it('should fetch latest release when version is "latest"', async () => {
      const release = createMockRelease("v1.0.0");
      apiClient.getLatestRelease = mock(async () => release);

      const result = await fetchGiteaRelease("owner/repo", "latest", false, apiClient, logger);

      assert(result.success);
      expect(result.data.tag_name).toBe("v1.0.0");
    });

    it("should return error when latest release is not found", async () => {
      apiClient.getLatestRelease = mock(async () => null);

      const result = await fetchGiteaRelease("owner/repo", "latest", false, apiClient, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`"Failed to fetch latest release for owner/repo"`);
    });

    it("should fetch prerelease when includePrerelease is true", async () => {
      const prerelease = createMockRelease("v2.0.0-beta.1");
      prerelease.prerelease = true;
      apiClient.getAllReleases = mock(async () => [prerelease]);

      const result = await fetchGiteaRelease("owner/repo", "latest", true, apiClient, logger);

      assert(result.success);
      expect(result.data.tag_name).toBe("v2.0.0-beta.1");
    });

    it("should return error when no prereleases found", async () => {
      apiClient.getAllReleases = mock(async () => []);

      const result = await fetchGiteaRelease("owner/repo", "latest", true, apiClient, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`"Failed to fetch latest release for owner/repo"`);
    });
  });

  describe("specific version", () => {
    it("should fetch release by exact tag", async () => {
      const release = createMockRelease("v2.3.0");
      apiClient.getReleaseByTag = mock(async () => release);

      const result = await fetchGiteaRelease("owner/repo", "v2.3.0", false, apiClient, logger);

      assert(result.success);
      expect(result.data.tag_name).toBe("v2.3.0");
    });

    it("should return error and show available tags when tag not found", async () => {
      apiClient.getReleaseByTag = mock(async () => null);
      apiClient.getLatestReleaseTags = mock(async () => ["v2.0.0", "v1.9.0", "v1.8.0"]);

      const result = await fetchGiteaRelease("owner/repo", "v99.99", false, apiClient, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(
        `"Release 'v99.99' not found for owner/repo. Check the available tags above."`,
      );
    });

    it("should show no-tags message when repository has no releases", async () => {
      apiClient.getReleaseByTag = mock(async () => null);
      apiClient.getLatestReleaseTags = mock(async () => []);

      const result = await fetchGiteaRelease("owner/repo", "v1.0.0", false, apiClient, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(
        `"Release 'v1.0.0' not found for owner/repo. Check the available tags above."`,
      );
    });
  });
});

describe("selectAsset", () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  describe("assetPattern with platform filtering", () => {
    it("should select macos-arm64 asset when pattern is *.tar.gz on macOS arm64", () => {
      const release = createMockRelease("v1.0.0", [
        createMockAsset("tool-linux-amd64.tar.gz"),
        createMockAsset("tool-linux-arm64.tar.gz"),
        createMockAsset("tool-macos-arm64.tar.gz"),
        createMockAsset("tool-macos-x86_64.tar.gz"),
      ]);
      const context = createMacOSArm64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        assetPattern: "*.tar.gz",
      };

      const result = selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe("tool-macos-arm64.tar.gz");
    });

    it("should select linux-x64 asset when pattern is *.tar.gz on Linux x64", () => {
      const release = createMockRelease("v1.0.0", [
        createMockAsset("tool-linux-amd64.tar.gz"),
        createMockAsset("tool-linux-arm64.tar.gz"),
        createMockAsset("tool-macos-arm64.tar.gz"),
      ]);
      const context = createLinuxX64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        assetPattern: "*.tar.gz",
      };

      const result = selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe("tool-linux-amd64.tar.gz");
    });
  });

  describe("assetPattern without platform match", () => {
    it("should return first matching asset when no platform-specific match exists", () => {
      const release = createMockRelease("v1.0.0", [
        createMockAsset("tool-universal.tar.gz"),
        createMockAsset("tool-source.tar.gz"),
      ]);
      const context = createMacOSArm64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        assetPattern: "*.tar.gz",
      };

      const result = selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe("tool-universal.tar.gz");
    });
  });

  describe("no assetPattern - platform-only selection", () => {
    it("should select platform-specific asset without assetPattern", () => {
      const release = createMockRelease("v1.0.0", [
        createMockAsset("tool-linux-amd64.tar.gz"),
        createMockAsset("tool-macos-arm64.tar.gz"),
      ]);
      const context = createMacOSArm64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
      };

      const result = selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe("tool-macos-arm64.tar.gz");
    });
  });

  describe("custom assetSelector", () => {
    it("should use custom assetSelector when provided", () => {
      const release = createMockRelease("v1.0.0", [
        createMockAsset("tool-linux-amd64.tar.gz"),
        createMockAsset("tool-special.tar.gz"),
      ]);
      const context = createMacOSArm64Context();
      const specialAsset = release.assets[1]!;
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        assetSelector: (ctx) => ctx.assets.find((a) => a.name === "tool-special.tar.gz"),
      };

      const result = selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe(specialAsset.name);
    });

    it("should return error when custom assetSelector returns undefined", () => {
      const release = createMockRelease("v1.0.0", [createMockAsset("tool-linux-amd64.tar.gz")]);
      const context = createMacOSArm64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        assetSelector: () => undefined,
      };

      const result = selectAsset(release, params, context, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`
        "No suitable asset found in release "v1.0.0" using a custom assetSelector function for macos/arm64.
        Available assets in release "v1.0.0":
          - tool-linux-amd64.tar.gz"
      `);
    });
  });

  describe("no matching asset", () => {
    it("should return error with available assets when no match found", () => {
      const release = createMockRelease("v1.0.0", [
        createMockAsset("tool-windows-amd64.zip"),
        createMockAsset("tool-windows-arm64.zip"),
      ]);
      const context = createMacOSArm64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
      };

      const result = selectAsset(release, params, context, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`
        "No suitable asset found in release "v1.0.0" for platform "macos" and architecture "arm64".
        Available assets in release "v1.0.0":
          - tool-windows-amd64.zip
          - tool-windows-arm64.zip"
      `);
    });

    it("should include pattern info in error when assetPattern is set", () => {
      const release = createMockRelease("v1.0.0", [createMockAsset("tool-windows.exe")]);
      const context = createMacOSArm64Context();
      const params: GiteaReleaseInstallParams = {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        assetPattern: "*.tar.gz",
      };

      const result = selectAsset(release, params, context, logger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`
        "No suitable asset found in release "v1.0.0" for asset pattern: "*.tar.gz" for macos/arm64.
        Available assets in release "v1.0.0":
          - tool-windows.exe"
      `);
    });
  });
});
