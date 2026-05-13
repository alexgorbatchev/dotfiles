import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import type { ProjectConfig } from "@dotfiles/config";
import { Architecture, type IGitHubReleaseAsset, type IInstallContext, Platform } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import type { IGitHubApiClient } from "../github-client";
import { installFromGitHubRelease } from "../installFromGitHubRelease";
import type { GithubReleaseToolConfig } from "../schemas";

function createMockAsset(name: string): IGitHubReleaseAsset {
  const asset: IGitHubReleaseAsset = {
    name,
    content_type: "application/gzip",
    size: 1024,
    download_count: 100,
    browser_download_url: `https://github.com/owner/repo/releases/download/v1.0.0/${name}`,
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

function createMockGitHubApiClient(asset: IGitHubReleaseAsset): IGitHubApiClient {
  return {
    getLatestRelease: mock(async () => ({
      id: 1,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      draft: false,
      prerelease: false,
      created_at: "2024-01-01T00:00:00Z",
      published_at: "2024-01-01T00:00:00Z",
      assets: [asset],
      html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
    })),
    getReleaseByTag: mock(async () => null),
    getAllReleases: mock(async () => []),
    getLatestReleaseTags: mock(async () => []),
  } as unknown as IGitHubApiClient;
}

function createMockDownloader(): IDownloader {
  return {
    download: mock(async () => Buffer.from("archive-content")),
    registerStrategy: mock(() => {}),
    downloadToFile: mock(async () => {}),
  } as unknown as IDownloader;
}

function createMockFs(): IFileSystem {
  return {
    exists: mock(async () => false),
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
    createEnhancedContext: mock((context: unknown) => context),
    executeHook: mock(async () => ({ success: true })),
  } as unknown as HookExecutor;
}

function createMockArchiveExtractor(): IArchiveExtractor {
  return {
    extract: mock(async () => ({
      extractedFiles: ["test-tool/bin/test-tool"],
      executables: ["test-tool/bin/test-tool"],
    })),
  } as unknown as IArchiveExtractor;
}

function createProjectConfig(): ProjectConfig {
  return {
    github: {
      host: "https://github.com",
    },
  } as ProjectConfig;
}

describe("installFromGitHubRelease", () => {
  let logger: TestLogger;
  let context: IInstallContext;
  let downloader: IDownloader;
  let fs: IFileSystem;
  let hookExecutor: HookExecutor;
  let archiveExtractor: IArchiveExtractor;
  let projectConfig: ProjectConfig;

  beforeEach(() => {
    logger = new TestLogger();
    context = createTestContext();
    downloader = createMockDownloader();
    fs = createMockFs();
    hookExecutor = createMockHookExecutor();
    archiveExtractor = createMockArchiveExtractor();
    projectConfig = createProjectConfig();
  });

  it("extracts archives into a dedicated subdirectory before after-extract hooks run", async () => {
    const asset = createMockAsset("test-tool-macos-arm64.tar.gz");
    const apiClient = createMockGitHubApiClient(asset);
    const toolConfig: GithubReleaseToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "github-release",
      installParams: {
        repo: "owner/repo",
        hooks: {
          "after-extract": [async () => {}],
        },
      },
    };

    const result = await installFromGitHubRelease(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      apiClient,
      archiveExtractor,
      projectConfig,
      hookExecutor,
      logger,
    );

    const downloadPath = path.join(context.stagingDir, asset.name);
    const extractDir = path.join(context.stagingDir, "extracted");
    const extractResult = {
      extractedFiles: ["test-tool/bin/test-tool"],
      executables: ["test-tool/bin/test-tool"],
    };
    const extractCall = (archiveExtractor.extract as ReturnType<typeof mock>).mock.calls[0];
    const hookContextCall = (hookExecutor.createEnhancedContext as ReturnType<typeof mock>).mock.calls[0];

    expect(result.success).toBe(true);
    assert(extractCall);
    assert(hookContextCall);
    expect(extractCall[1]).toBe(downloadPath);
    expect(extractCall[2]).toEqual({ targetDir: extractDir });
    expect(hookContextCall[0]).toEqual({
      ...context,
      downloadPath,
      extractDir,
      extractResult,
    });
    expect(hookContextCall[1]).toBe(fs);
  });
});
