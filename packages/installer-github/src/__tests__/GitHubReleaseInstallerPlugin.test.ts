import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import type { ProjectConfig } from "@dotfiles/config";
import type { IGitHubRelease, IInstallContext } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { GithubReleaseToolConfig } from "@dotfiles/installer-github";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import type { IGitHubApiClient } from "../github-client";
import { GitHubReleaseInstallerPlugin } from "../GitHubReleaseInstallerPlugin";

function createMockRelease(tagName: string): IGitHubRelease {
  const mockRelease: IGitHubRelease = {
    id: 1,
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
    created_at: "2023-01-01T00:00:00Z",
    published_at: "2023-01-01T00:00:00Z",
    assets: [],
    html_url: `https://github.com/owner/repo/releases/tag/${tagName}`,
  };
  return mockRelease;
}

describe("GitHubReleaseInstallerPlugin", () => {
  let plugin: GitHubReleaseInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubClient: IGitHubApiClient;
  let mockUncachedGitHubClient: IGitHubApiClient;
  let mockGhCliApiClient: IGitHubApiClient;
  let mockUncachedGhCliApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockProjectConfig: ProjectConfig;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockGitHubClient = {} as IGitHubApiClient;
    mockUncachedGitHubClient = {} as IGitHubApiClient;
    mockGhCliApiClient = {} as IGitHubApiClient;
    mockUncachedGhCliApiClient = {} as IGitHubApiClient;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockProjectConfig = {} as ProjectConfig;
    mockHookExecutor = {} as HookExecutor;

    plugin = new GitHubReleaseInstallerPlugin(
      mockFs,
      mockDownloader,
      mockGitHubClient,
      mockGhCliApiClient,
      mockUncachedGitHubClient,
      mockUncachedGhCliApiClient,
      mockArchiveExtractor,
      mockProjectConfig,
      mockHookExecutor,
    );
  });

  it("should have correct plugin metadata", () => {
    expect(plugin.method).toBe("github-release");
    expect(plugin.displayName).toBe("GitHub Release");
    expect(plugin.version).toBe("1.0.0");
  });

  it("should have valid schemas", () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it("should validate correct params", () => {
    const validParams = {
      repo: "owner/repo",
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("should validate correct tool config", () => {
    const validConfig: GithubReleaseToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "github-release",
      installParams: {
        repo: "owner/repo",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("should reject invalid tool config", () => {
    const invalidConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "github-release",
      installParams: {
        invalidParam: "value",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  describe("getApiClient", () => {
    it("should use uncached fetch client for forced latest installs", () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      const getApiClient = Reflect.get(plugin, "getApiClient");
      const apiClient = getApiClient.call(plugin, toolConfig, { force: true });

      expect(apiClient).toBe(mockUncachedGitHubClient);
    });

    it("should use uncached gh client for forced latest installs when ghCli is enabled", () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
          ghCli: true,
        },
      };

      const getApiClient = Reflect.get(plugin, "getApiClient");
      const apiClient = getApiClient.call(plugin, toolConfig, { force: true });

      expect(apiClient).toBe(mockUncachedGhCliApiClient);
    });

    it("should keep using the cached client when a specific version is requested", () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
          version: "v1.2.3",
        },
      };

      const getApiClient = Reflect.get(plugin, "getApiClient");
      const apiClient = getApiClient.call(plugin, toolConfig, { force: true });

      expect(apiClient).toBe(mockGitHubClient);
    });
  });

  describe("resolveVersion", () => {
    let testLogger: TestLogger;
    let mockContext: IInstallContext;

    beforeEach(() => {
      testLogger = new TestLogger();
      mockContext = {} as IInstallContext;
    });

    it("should resolve version from GitHub release tag", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      mockGitHubClient.getLatestRelease = mock(async () => createMockRelease("v1.2.3"));

      const version: string | null = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, testLogger);

      expect(version).toBe("1.2.3");
      expect(mockGitHubClient.getLatestRelease).toHaveBeenCalledWith("owner", "repo");
    });

    it("should return null when GitHub API call fails", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      mockGitHubClient.getLatestRelease = mock(async () => null);

      const version: string | null = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, testLogger);

      expect(version).toBeNull();
      // fetchGitHubRelease logs debug message, then resolveVersion logs failure
      testLogger.expect(["DEBUG"], ["fetchGitHubRelease"], [], ["Getting latest release for owner/repo"]);
      testLogger.expect(["DEBUG"], [], [], [/Failed to resolve version for test-tool/]);
    });

    it("should return null when exception occurs", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      mockGitHubClient.getLatestRelease = mock(async () => {
        assert.fail("Network error");
      });

      const version: string | null = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, testLogger);

      expect(version).toBeNull();
      // fetchGitHubRelease throws, then resolveVersion catches and logs exception
      testLogger.expect(["DEBUG"], [], [], [/Exception while resolving version/]);
    });

    it("should normalize version by stripping v prefix", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      mockGitHubClient.getLatestRelease = mock(async () => createMockRelease("v15.1.0"));

      const version: string | null = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, testLogger);

      expect(version).toBe("15.1.0");
    });

    it("should resolve version by tag when specific version is requested", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "v2.0.0",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      mockGitHubClient.getReleaseByTag = mock(async () => createMockRelease("v2.0.0"));

      const version: string | null = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, testLogger);

      expect(version).toBe("2.0.0");
      expect(mockGitHubClient.getReleaseByTag).toHaveBeenCalledWith("owner", "repo", "v2.0.0");
    });
  });

  describe("checkUpdate", () => {
    let testLogger: TestLogger;
    let mockContext: IInstallContext;

    beforeEach(() => {
      testLogger = new TestLogger();
      mockContext = {} as IInstallContext;
    });

    it("should report configured latest version for latest-tracking tools", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
        },
      };

      mockGitHubClient.getLatestRelease = mock(async () => createMockRelease("v1.2.3"));

      const result = await plugin.checkUpdate("test-tool", mockToolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
      expect(result.currentVersion).toBe("latest");
      expect(result.latestVersion).toBe("1.2.3");
    });

    it("should use install params version when checking updates", async () => {
      const mockToolConfig: GithubReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "github-release",
        installParams: {
          repo: "owner/repo",
          version: "v1.2.3",
        },
      };

      mockGitHubClient.getLatestRelease = mock(async () => createMockRelease("v1.2.3"));

      const result = await plugin.checkUpdate("test-tool", mockToolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
      expect(result.currentVersion).toBe("1.2.3");
      expect(result.latestVersion).toBe("1.2.3");
    });
  });
});
