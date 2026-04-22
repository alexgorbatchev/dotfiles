import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import type { IGitHubRelease, IInstallContext, IUpdateCheckContext } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import { NotFoundError } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { GiteaReleaseToolConfig } from "@dotfiles/installer-gitea";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { GiteaReleaseInstallerPlugin } from "../GiteaReleaseInstallerPlugin";

function createMockGiteaRelease(tagName: string): IGitHubRelease {
  const mockRelease: IGitHubRelease = {
    id: 1,
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
    created_at: "2025-01-01T00:00:00Z",
    published_at: "2025-01-01T00:00:00Z",
    assets: [],
    html_url: `https://codeberg.org/owner/repo/releases/tag/${tagName}`,
  };
  return mockRelease;
}

function createGiteaReleaseApiResponse(tagName: string): object {
  return {
    id: 1,
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
    created_at: "2025-01-01T00:00:00Z",
    published_at: "2025-01-01T00:00:00Z",
    html_url: `https://codeberg.org/owner/repo/releases/tag/${tagName}`,
    assets: [],
    url: "",
    tarball_url: "",
    zipball_url: "",
    target_commitish: "main",
    author: { id: 1, login: "test" },
  };
}

describe("GiteaReleaseInstallerPlugin", () => {
  let plugin: GiteaReleaseInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {
      download: mock(async () => Buffer.from("")),
      registerStrategy: mock(() => {}),
      downloadToFile: mock(async () => {}),
    } as unknown as IDownloader;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockHookExecutor = {} as HookExecutor;

    plugin = new GiteaReleaseInstallerPlugin(mockFs, mockDownloader, mockArchiveExtractor, mockHookExecutor);
  });

  it("should have correct plugin metadata", () => {
    expect(plugin.method).toBe("gitea-release");
    expect(plugin.displayName).toBe("Gitea Release");
    expect(plugin.version).toBe("1.0.0");
  });

  it("should have valid schemas", () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it("should validate correct params", () => {
    const validParams = {
      instanceUrl: "https://codeberg.org",
      repo: "owner/repo",
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("should reject params without instanceUrl", () => {
    const invalidParams = {
      repo: "owner/repo",
    };

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it("should reject invalid instanceUrl", () => {
    const invalidParams = {
      instanceUrl: "not-a-url",
      repo: "owner/repo",
    };

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it("should validate correct tool config", () => {
    const validConfig: GiteaReleaseToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "gitea-release",
      installParams: {
        instanceUrl: "https://codeberg.org",
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
      installationMethod: "gitea-release",
      installParams: {
        invalidParam: "value",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  describe("resolveVersion", () => {
    let testLogger: TestLogger;
    let mockContext: IInstallContext;

    beforeEach(() => {
      testLogger = new TestLogger();
      mockContext = {} as IInstallContext;
    });

    it("should resolve version from Gitea release tag", async () => {
      const mockToolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      const releaseFixture = createMockGiteaRelease("v1.2.3");
      // The plugin creates a GiteaApiClient internally using the downloader
      // Mock the downloader to return the release fixture for the latest release endpoint
      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(
          JSON.stringify({
            ...releaseFixture,
            url: "",
            tarball_url: "",
            zipball_url: "",
            target_commitish: "main",
            author: { id: 1, login: "test" },
          }),
        ),
      );

      const version = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, undefined, testLogger);
      expect(version).toBe("1.2.3");
    });

    it("should return null when API call fails", async () => {
      const mockToolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      (mockDownloader.download as ReturnType<typeof mock>).mockRejectedValue(
        new Error(
          "Gitea resource not found: https://codeberg.org/api/v1/repos/owner/repo/releases/latest. Status: 404",
        ),
      );

      const version = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, undefined, testLogger);
      expect(version).toBeNull();
    });

    it("should normalize version by stripping v prefix", async () => {
      const mockToolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      const releaseFixture = createMockGiteaRelease("v15.1.0");
      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(
          JSON.stringify({
            ...releaseFixture,
            url: "",
            tarball_url: "",
            zipball_url: "",
            target_commitish: "main",
            author: { id: 1, login: "test" },
          }),
        ),
      );

      const version = await plugin.resolveVersion("test-tool", mockToolConfig, mockContext, undefined, testLogger);
      expect(version).toBe("15.1.0");
    });
  });

  describe("getReadmeUrl", () => {
    it("should return README URL for Gitea instance", () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "main",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "Codeberg/pages-server",
        },
      };

      const url = plugin.getReadmeUrl("test-tool", toolConfig);
      expect(url).toBe("https://codeberg.org/Codeberg/pages-server/raw/branch/main/README.md");
    });

    it("should handle instanceUrl with trailing slash", () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org/",
          repo: "owner/repo",
        },
      };

      const url = plugin.getReadmeUrl("test-tool", toolConfig);
      expect(url).toBe("https://codeberg.org/owner/repo/raw/branch/1.0.0/README.md");
    });

    it("should return null for invalid repo format", () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "invalid-repo",
        },
      } as unknown as GiteaReleaseToolConfig;

      const url = plugin.getReadmeUrl("test-tool", toolConfig);
      expect(url).toBeNull();
    });
  });

  describe("supportsUpdate", () => {
    it("should return true", () => {
      expect(plugin.supportsUpdate()).toBe(true);
    });
  });

  describe("supportsUpdateCheck", () => {
    it("should return true", () => {
      expect(plugin.supportsUpdateCheck()).toBe(true);
    });
  });

  describe("supportsReadme", () => {
    it("should return true", () => {
      expect(plugin.supportsReadme()).toBe(true);
    });
  });

  describe("checkUpdate", () => {
    let testLogger: TestLogger;
    let mockContext: IUpdateCheckContext;

    beforeEach(() => {
      testLogger = new TestLogger();
      mockContext = {};
    });

    it('should report configured latest version when version is "latest"', async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(JSON.stringify(createGiteaReleaseApiResponse("v2.0.0"))),
      );

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
      expect(result.currentVersion).toBe("latest");
      expect(result.latestVersion).toBe("2.0.0");
    });

    it("should compare installed version for latest-tracking tools", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      mockContext = { installedVersion: "v1.0.0" };
      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(JSON.stringify(createGiteaReleaseApiResponse("v2.0.0"))),
      );

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(true);
      expect(result.currentVersion).toBe("1.0.0");
      expect(result.latestVersion).toBe("2.0.0");
    });

    it("should use install params version when checking updates", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "latest",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
          version: "v2.0.0",
        },
      };

      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(JSON.stringify(createGiteaReleaseApiResponse("v2.0.0"))),
      );

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
      expect(result.currentVersion).toBe("2.0.0");
      expect(result.latestVersion).toBe("2.0.0");
    });

    it("should report update available when versions differ", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(JSON.stringify(createGiteaReleaseApiResponse("v2.0.0"))),
      );

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(true);
      expect(result.currentVersion).toBe("1.0.0");
      expect(result.latestVersion).toBe("2.0.0");
    });

    it("should report no update when versions match", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "2.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      (mockDownloader.download as ReturnType<typeof mock>).mockResolvedValue(
        Buffer.from(JSON.stringify(createGiteaReleaseApiResponse("v2.0.0"))),
      );

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
    });

    it("should return error for invalid repo format", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "invalid-repo",
        },
      } as unknown as GiteaReleaseToolConfig;

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`"Invalid repo format: invalid-repo. Expected owner/repo"`);
    });

    it("should return error when latest release cannot be fetched", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      const url = "https://codeberg.org/api/v1/repos/owner/repo/releases/latest";
      (mockDownloader.download as ReturnType<typeof mock>).mockRejectedValue(
        new NotFoundError(testLogger, url, new Error("404")),
      );

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`"Could not fetch latest release for test-tool"`);
    });

    it("should return error when API throws an exception", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
        },
      };

      (mockDownloader.download as ReturnType<typeof mock>).mockRejectedValue(new Error("Network connection failed"));

      const result = await plugin.checkUpdate("test-tool", toolConfig, mockContext, testLogger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(
        `"Unknown error during Gitea API request to https://codeberg.org/api/v1/repos/owner/repo/releases/latest: Network connection failed"`,
      );
    });
  });

  describe("install", () => {
    let testLogger: TestLogger;
    let mockContext: IInstallContext;

    beforeEach(() => {
      testLogger = new TestLogger();
      mockContext = {
        toolName: "test-tool",
        currentDir: "/path/to/tools/test-tool",
        stagingDir: "/path/to/tools/test-tool/.staging",
        systemInfo: {
          platform: "darwin",
          arch: "arm64",
          homeDir: "/Users/test",
          hostname: "test-host",
        },
      } as unknown as IInstallContext;
    });

    it("should return error when installParams is missing repo", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
        },
      } as unknown as GiteaReleaseToolConfig;

      const result = await plugin.install("test-tool", toolConfig, mockContext, undefined, testLogger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(`"Repository not specified in installParams"`);
    });

    it("should return error for invalid repo format", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "invalid-repo",
        },
      } as unknown as GiteaReleaseToolConfig;

      const result = await plugin.install("test-tool", toolConfig, mockContext, undefined, testLogger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(
        `"Invalid repository format: invalid-repo. Expected format: owner/repo"`,
      );
    });

    it("should return error when release cannot be fetched", async () => {
      const toolConfig: GiteaReleaseToolConfig = {
        name: "test-tool",
        version: "1.0.0",
        binaries: ["test-tool"],
        installationMethod: "gitea-release",
        installParams: {
          instanceUrl: "https://codeberg.org",
          repo: "owner/repo",
          version: "v99.99",
        },
      };

      const url = "https://codeberg.org/api/v1/repos/owner/repo/releases/tags/v99.99";
      (mockDownloader.download as ReturnType<typeof mock>).mockRejectedValue(
        new NotFoundError(testLogger, url, new Error("404")),
      );

      const result = await plugin.install("test-tool", toolConfig, mockContext, undefined, testLogger);

      assert(!result.success);
      expect(result.error).toMatchInlineSnapshot(
        `"Release 'v99.99' not found for owner/repo. Check the available tags above."`,
      );
    });
  });
});
