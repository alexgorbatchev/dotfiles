import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { Architecture, type IGitHubReleaseAsset, type IInstallContext, Platform } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import type { IGiteaApiClient } from "../gitea-client";
import { installFromGiteaRelease } from "../installFromGiteaRelease";
import type { GiteaReleaseToolConfig } from "../schemas";

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

function createTestContext(): IInstallContext {
  return {
    toolName: "test-tool",
    currentDir: "/path/to/tools/test-tool",
    stagingDir: "/tmp/staging",
    systemInfo: {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: "/Users/test",
      hostname: "test-host",
    },
    projectConfig: {
      paths: {
        generatedDir: "/tmp/generated",
      },
    },
  } as IInstallContext;
}

function createMockGiteaApiClient(): IGiteaApiClient {
  return {
    getLatestRelease: mock(async () => null),
    getReleaseByTag: mock(async () => null),
    getAllReleases: mock(async () => []),
    getLatestReleaseTags: mock(async () => []),
  };
}

function createMockDownloader(): IDownloader {
  return {
    download: mock(async () => Buffer.from("")),
    registerStrategy: mock(() => {}),
    downloadToFile: mock(async () => {}),
  } as unknown as IDownloader;
}

function createMockFs(): IFileSystem {
  return {
    exists: mock(async () => true),
    rm: mock(async () => {}),
    mkdir: mock(async () => undefined),
    ensureDir: mock(async () => {}),
    writeFile: mock(async () => {}),
    readFile: mock(async () => ""),
    chmod: mock(async () => {}),
    stat: mock(async () => ({ isFile: () => true, isDirectory: () => false, mode: 0o755 })),
    lstat: mock(async () => ({ isSymbolicLink: () => true })),
    symlink: mock(async () => {}),
    rename: mock(async () => {}),
    readdir: mock(async () => []),
    copyFile: mock(async () => {}),
    join: (...parts: string[]) => parts.join("/"),
    resolve: (...parts: string[]) => parts.join("/"),
  } as unknown as IFileSystem;
}

function createMockHookExecutor(): HookExecutor {
  return {
    createEnhancedContext: mock((_context: unknown, _fs: unknown) => ({})),
    executeHook: mock(async () => ({ success: true })),
  } as unknown as HookExecutor;
}

function createMockArchiveExtractor(): IArchiveExtractor {
  return {
    extract: mock(async () => ({
      extractedFiles: ["test-tool"],
      executables: ["test-tool"],
    })),
  } as unknown as IArchiveExtractor;
}

function createToolConfig(overrides: Partial<GiteaReleaseToolConfig> = {}): GiteaReleaseToolConfig {
  return {
    name: "test-tool",
    version: "1.0.0",
    binaries: ["test-tool"],
    installationMethod: "gitea-release",
    installParams: {
      instanceUrl: "https://codeberg.org",
      repo: "owner/repo",
    },
    ...overrides,
  };
}

describe("installFromGiteaRelease", () => {
  let logger: TestLogger;
  let context: IInstallContext;
  let apiClient: IGiteaApiClient;
  let downloader: IDownloader;
  let fs: IFileSystem;
  let hookExecutor: HookExecutor;
  let archiveExtractor: IArchiveExtractor;

  beforeEach(() => {
    logger = new TestLogger();
    context = createTestContext();
    apiClient = createMockGiteaApiClient();
    downloader = createMockDownloader();
    fs = createMockFs();
    hookExecutor = createMockHookExecutor();
    archiveExtractor = createMockArchiveExtractor();
  });

  it("should return error when installParams has no repo", async () => {
    const toolConfig = createToolConfig();
    toolConfig.installParams = {
      instanceUrl: "https://codeberg.org",
    } as unknown as GiteaReleaseToolConfig["installParams"];

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(!result.success);
    expect(result.error).toMatchInlineSnapshot(`"Repository not specified in installParams"`);
  });

  it("should return error for invalid repo format", async () => {
    const toolConfig = createToolConfig({
      installParams: { instanceUrl: "https://codeberg.org", repo: "invalid" },
    }) as unknown as GiteaReleaseToolConfig;

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(!result.success);
    expect(result.error).toMatchInlineSnapshot(`"Invalid repository format: invalid. Expected format: owner/repo"`);
  });

  it("should return error when release fetch fails", async () => {
    apiClient.getLatestRelease = mock(async () => null);
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(!result.success);
    expect(result.error).toMatchInlineSnapshot(`"Failed to fetch latest release for owner/repo"`);
  });

  it("should return error when no suitable asset found", async () => {
    apiClient.getLatestRelease = mock(async () => ({
      id: 1,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [createMockAsset("tool-windows-amd64.exe")],
      html_url: "https://codeberg.org/owner/repo/releases/tag/v1.0.0",
    }));
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(!result.success);
    expect(result.error).toMatchInlineSnapshot(`
      "No suitable asset found in release "v1.0.0" for platform "macos" and architecture "arm64".
      Available assets in release "v1.0.0":
        - tool-windows-amd64.exe"
    `);
  });

  it("should return error when download fails", async () => {
    apiClient.getLatestRelease = mock(async () => ({
      id: 1,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [createMockAsset("tool-macos-arm64.tar.gz")],
      html_url: "https://codeberg.org/owner/repo/releases/tag/v1.0.0",
    }));
    (downloader.download as ReturnType<typeof mock>).mockRejectedValue(new Error("Download failed: connection reset"));
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(!result.success);
    expect(result.error).toMatchInlineSnapshot(`"Download failed: connection reset"`);
  });

  it("should return success for direct binary download", async () => {
    const asset = createMockAsset("test-tool-macos-arm64");
    apiClient.getLatestRelease = mock(async () => ({
      id: 1,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [asset],
      html_url: "https://codeberg.org/owner/repo/releases/tag/v1.0.0",
    }));
    (downloader.download as ReturnType<typeof mock>).mockResolvedValue(Buffer.from("binary-content"));
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(result.success);
    expect(result.originalTag).toBe("v1.0.0");
    expect(result.metadata.method).toBe("gitea-release");
    expect(result.metadata.instanceUrl).toBe("https://codeberg.org");
    expect(result.metadata.assetName).toBe("test-tool-macos-arm64");
    expect(result.metadata.downloadUrl).toBe(asset.browser_download_url);
  });

  it("should extract archive and return success for tar.gz assets", async () => {
    const asset = createMockAsset("test-tool-macos-arm64.tar.gz");
    apiClient.getLatestRelease = mock(async () => ({
      id: 1,
      tag_name: "v2.0.0",
      name: "v2.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [asset],
      html_url: "https://codeberg.org/owner/repo/releases/tag/v2.0.0",
    }));
    (downloader.download as ReturnType<typeof mock>).mockResolvedValue(Buffer.from("archive-content"));
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    const extractCall = (archiveExtractor.extract as ReturnType<typeof mock>).mock.calls[0];

    assert(result.success);
    expect(result.version).toBe("v2.0.0");
    expect(result.metadata.assetName).toBe("test-tool-macos-arm64.tar.gz");
    assert(extractCall);
    expect(extractCall[1]).toBe(path.join(context.stagingDir, asset.name));
    expect(extractCall[2]).toEqual({ targetDir: path.join(context.stagingDir, "extracted") });
  });

  it("should pass the dedicated extract directory to after-extract hooks", async () => {
    const asset = createMockAsset("test-tool-macos-arm64.tar.gz");
    const extractResult = {
      extractedFiles: ["test-tool/bin/test-tool"],
      executables: ["test-tool/bin/test-tool"],
    };

    apiClient.getLatestRelease = mock(async () => ({
      id: 1,
      tag_name: "v2.0.0",
      name: "v2.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [asset],
      html_url: "https://codeberg.org/owner/repo/releases/tag/v2.0.0",
    }));
    (downloader.download as ReturnType<typeof mock>).mockResolvedValue(Buffer.from("archive-content"));
    archiveExtractor = {
      extract: mock(async () => extractResult),
    } as unknown as IArchiveExtractor;
    hookExecutor = {
      createEnhancedContext: mock((hookContext: unknown) => hookContext),
      executeHook: mock(async () => ({ success: true })),
    } as unknown as HookExecutor;

    const toolConfig = createToolConfig({
      installParams: {
        instanceUrl: "https://codeberg.org",
        repo: "owner/repo",
        hooks: {
          "after-extract": [async () => {}],
        },
      },
    });

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    const downloadPath = path.join(context.stagingDir, asset.name);
    const extractDir = path.join(context.stagingDir, "extracted");
    const hookContextCall = (hookExecutor.createEnhancedContext as ReturnType<typeof mock>).mock.calls[0];

    assert(result.success);
    assert(hookContextCall);
    expect(hookContextCall[0]).toEqual({
      ...context,
      downloadPath,
      extractDir,
      extractResult,
    });
    expect(hookContextCall[1]).toBe(fs);
  });

  it("should clean up archive file after extraction when it exists", async () => {
    const asset = createMockAsset("test-tool-macos-arm64.tar.gz");
    apiClient.getLatestRelease = mock(async () => ({
      id: 1,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [asset],
      html_url: "https://codeberg.org/owner/repo/releases/tag/v1.0.0",
    }));
    (downloader.download as ReturnType<typeof mock>).mockResolvedValue(Buffer.from("archive"));
    (fs.exists as ReturnType<typeof mock>).mockResolvedValue(true);
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(result.success);
    expect(fs.rm).toHaveBeenCalled();
  });

  it("should catch and return unexpected exceptions", async () => {
    apiClient.getLatestRelease = mock(async () => {
      assert.fail("Unexpected internal error");
    });
    const toolConfig = createToolConfig();

    const result = await installFromGiteaRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      hookExecutor,
      logger,
    );

    assert(!result.success);
    expect(result.error).toMatchInlineSnapshot(`"Unexpected internal error"`);
  });
});
