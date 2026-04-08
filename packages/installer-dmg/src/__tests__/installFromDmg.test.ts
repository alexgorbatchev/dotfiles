import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { Platform } from "@dotfiles/core";
import type { IInstallContext, Shell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import { TestLogger } from "@dotfiles/logger";
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { installFromDmg } from "../installFromDmg";
import type { DmgToolConfig } from "../schemas";

// Mock Bun.spawn to intercept all shell commands (hdiutil attach via internal createShell).
// This avoids mock.module('@dotfiles/core') which leaks across test files in the same worker.
const originalBunSpawn = Bun.spawn;

function mockBunSpawn(): void {
  Bun.spawn = ((..._args: unknown[]) => ({
    stdout: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    stderr: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    exited: Promise.resolve(0),
    pid: 99999,
    kill: () => {},
  })) as typeof Bun.spawn;
}

interface IDmgShellMocks {
  shell: Shell;
  mockQuiet: ReturnType<typeof mock>;
  mockNoThrow: ReturnType<typeof mock>;
}

function createMockShell(): IDmgShellMocks {
  const mockNoThrow = mock(() => Promise.resolve({ stdout: "", stderr: "" }));
  const mockQuiet = mock(() => {
    const result = Promise.resolve({ stdout: "", stderr: "" });
    Object.assign(result, { noThrow: mockNoThrow });
    return result;
  });
  const mockFn = mock(() => ({ quiet: mockQuiet }));
  return { shell: mockFn as unknown as Shell, mockQuiet, mockNoThrow };
}

describe("installFromDmg", () => {
  let logger: TestLogger;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockHookExecutor: HookExecutor;
  let context: IInstallContext;

  beforeEach(() => {
    mockBunSpawn();

    logger = new TestLogger();
    mockFs = {
      ensureDir: mock(() => Promise.resolve()),
      readdir: mock(() => Promise.resolve(["TestApp.app"])),
      symlink: mock(() => Promise.resolve()),
      exists: mock(() => Promise.resolve(true)),
      rm: mock(() => Promise.resolve()),
    } as unknown as IFileSystem;
    mockDownloader = {
      download: mock(() => Promise.resolve()),
    } as unknown as IDownloader;
    mockArchiveExtractor = {
      extract: mock(() =>
        Promise.resolve({
          extractedFiles: ["/install/staging/TestApp.dmg"],
          executables: [],
        }),
      ),
    } as unknown as IArchiveExtractor;
    mockGitHubApiClient = {
      getLatestRelease: mock(() => Promise.resolve(null)),
      getReleaseByTag: mock(() => Promise.resolve(null)),
      getAllReleases: mock(() => Promise.resolve([])),
      getReleaseByConstraint: mock(() => Promise.resolve(null)),
      getRateLimit: mock(() =>
        Promise.resolve({
          resources: {
            core: { limit: 0, used: 0, remaining: 0, reset: 0 },
            search: { limit: 0, used: 0, remaining: 0, reset: 0 },
            graphql: { limit: 0, used: 0, remaining: 0, reset: 0 },
            integration_manifest: { limit: 0, used: 0, remaining: 0, reset: 0 },
            source_import: { limit: 0, used: 0, remaining: 0, reset: 0 },
            code_scanning_upload: { limit: 0, used: 0, remaining: 0, reset: 0 },
            actions_runner_registration: { limit: 0, used: 0, remaining: 0, reset: 0 },
            scim: { limit: 0, used: 0, remaining: 0, reset: 0 },
          },
          rate: { limit: 0, used: 0, remaining: 0, reset: 0 },
        }),
      ),
      probeLatestTag: mock(() => Promise.resolve(null)),
      getLatestReleaseTags: mock(() => Promise.resolve([])),
      downloadAsset: mock(() => Promise.resolve()),
    } as unknown as IGitHubApiClient;
    mockHookExecutor = {
      executeHook: mock(() => Promise.resolve({ success: true })),
      createEnhancedContext: mock((ctx: unknown) => ctx),
    } as unknown as HookExecutor;
    context = {
      stagingDir: "/install/staging",
      version: "1.0.0",
      systemInfo: { platform: Platform.MacOS },
      projectConfig: {
        paths: {
          binariesDir: "/path/to/binaries",
          homeDir: "/home/user",
          dotfilesDir: "/home/user/.dotfiles",
          targetDir: "/home/user/.local/bin",
          generatedDir: "/home/user/.dotfiles/.generated",
          toolConfigsDir: "/home/user/.dotfiles/tools",
          shellScriptsDir: "/home/user/.dotfiles/.generated/shell-scripts",
        },
      },
    } as unknown as IInstallContext;
  });

  afterEach(() => {
    Bun.spawn = originalBunSpawn;
  });

  afterAll(() => {
    Bun.spawn = originalBunSpawn;
  });

  describe("direct DMG flow", () => {
    it("should install from a direct .dmg URL", async () => {
      const { shell } = createMockShell();
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(result.binaryPaths).toEqual(["/Applications/TestApp.app/Contents/MacOS/test-app"]);
      expect(result.metadata.method).toBe("dmg");
      expect(result.metadata.dmgUrl).toBe("https://example.com/TestApp.dmg");
      expect(mockFs.ensureDir).toHaveBeenCalledWith("/install/staging");
    });

    it("should skip installation on non-macOS", async () => {
      const { shell } = createMockShell();
      const nonMacContext = {
        ...context,
        systemInfo: { platform: Platform.Linux },
      } as unknown as IInstallContext;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        nonMacContext,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(result.binaryPaths).toEqual([]);
    });

    it("should resolve and download DMG from github-release source", async () => {
      const { shell } = createMockShell();
      mockGitHubApiClient = {
        ...mockGitHubApiClient,
        getLatestRelease: mock(() =>
          Promise.resolve({
            tag_name: "v1.0.0",
            name: "v1.0.0",
            html_url: "https://github.com/manaflow-ai/cmux/releases/tag/v1.0.0",
            published_at: "2026-01-01T00:00:00Z",
            assets: [
              {
                name: "cmux-macos.dmg",
                browser_download_url: "https://github.com/manaflow-ai/cmux/releases/download/v1.0.0/cmux-macos.dmg",
              },
            ],
          }),
        ),
      } as unknown as IGitHubApiClient;

      const toolConfig: DmgToolConfig = {
        name: "cmux",
        version: "latest",
        binaries: ["cmux"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "github-release",
            repo: "manaflow-ai/cmux",
            assetPattern: "*macos*.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "cmux",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
        mockGitHubApiClient,
        undefined,
      );

      assert(result.success);
      expect(result.metadata.dmgUrl).toBe(
        "https://github.com/manaflow-ai/cmux/releases/download/v1.0.0/cmux-macos.dmg",
      );
      expect(mockDownloader.download).toHaveBeenCalled();
    });

    it("should fail when github-release asset is not dmg or archive", async () => {
      const { shell } = createMockShell();
      mockGitHubApiClient = {
        ...mockGitHubApiClient,
        getLatestRelease: mock(() =>
          Promise.resolve({
            tag_name: "v1.0.0",
            name: "v1.0.0",
            html_url: "https://github.com/manaflow-ai/cmux/releases/tag/v1.0.0",
            published_at: "2026-01-01T00:00:00Z",
            assets: [
              {
                name: "cmux-linux-amd64",
                browser_download_url: "https://github.com/manaflow-ai/cmux/releases/download/v1.0.0/cmux-linux-amd64",
              },
            ],
          }),
        ),
      } as unknown as IGitHubApiClient;

      const toolConfig: DmgToolConfig = {
        name: "cmux",
        version: "latest",
        binaries: ["cmux"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "github-release",
            repo: "manaflow-ai/cmux",
            assetPattern: "*linux*",
          },
        },
      };

      const result = await installFromDmg(
        "cmux",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
        mockGitHubApiClient,
        undefined,
      );

      assert(!result.success);
      expect(result.error).toContain("must be a .dmg or supported archive");
    });

    it("should return failure when after-download hook fails", async () => {
      const { shell } = createMockShell();
      mockHookExecutor = {
        executeHook: mock(() => Promise.resolve({ success: false, error: "hook error" })),
        createEnhancedContext: mock((ctx: unknown) => ctx),
      } as unknown as HookExecutor;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
          hooks: {
            "after-download": [async () => {}],
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(!result.success);
      expect(result.error).toBe("afterDownload hook failed: hook error");
    });

    it("should return failure when no .app bundle found", async () => {
      const { shell } = createMockShell();
      mockFs = {
        ...mockFs,
        ensureDir: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.resolve(["README.txt"])),
        exists: mock(() => Promise.resolve(true)),
        rm: mock(() => Promise.resolve()),
      } as unknown as IFileSystem;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(!result.success);
      expect(result.error).toBe("No .app bundle found in DMG");
    });

    it("should use custom binaryPath when specified", async () => {
      const { shell } = createMockShell();
      mockFs = {
        ...mockFs,
        ensureDir: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.resolve(["TestApp.app"])),
        exists: mock(() => Promise.resolve(true)),
        rm: mock(() => Promise.resolve()),
      } as unknown as IFileSystem;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
          binaryPath: "Contents/Resources/bin/test-app",
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(result.binaryPaths).toEqual(["/Applications/TestApp.app/Contents/Resources/bin/test-app"]);
    });

    it("should use config version when detection returns nothing and version is not latest", async () => {
      const { shell } = createMockShell();
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "3.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(result.version).toBe("3.0.0");
    });

    it("should unmount DMG in finally block even on error", async () => {
      const { shell, mockNoThrow } = createMockShell();
      mockFs = {
        ...mockFs,
        ensureDir: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.reject(new Error("readdir failed"))),
        exists: mock(() => Promise.resolve(true)),
        rm: mock(() => Promise.resolve()),
      } as unknown as IFileSystem;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(!result.success);
      expect(mockNoThrow).toHaveBeenCalledTimes(1);
    });

    it("should clean up DMG file after install", async () => {
      const { shell } = createMockShell();
      const rmMock = mock(() => Promise.resolve());
      mockFs = {
        ...mockFs,
        ensureDir: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.resolve(["TestApp.app"])),
        symlink: mock(() => Promise.resolve()),
        exists: mock(() => Promise.resolve(true)),
        rm: rmMock,
      } as unknown as IFileSystem;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(rmMock).toHaveBeenCalledWith("/install/staging/TestApp.dmg");
    });
  });

  describe("archive extraction flow", () => {
    it("should extract archive and install from contained .dmg", async () => {
      const { shell } = createMockShell();
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg.zip",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(result.binaryPaths).toEqual(["/Applications/TestApp.app/Contents/MacOS/test-app"]);
      expect(mockArchiveExtractor.extract).toHaveBeenCalledTimes(1);
    });

    it("should extract .tar.gz archive containing .dmg", async () => {
      const { shell } = createMockShell();
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.tar.gz",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(mockArchiveExtractor.extract).toHaveBeenCalledTimes(1);
    });

    it("should return failure when no .dmg found in archive", async () => {
      const { shell } = createMockShell();
      mockArchiveExtractor = {
        extract: mock(() =>
          Promise.resolve({
            extractedFiles: ["/install/staging/README.txt", "/install/staging/LICENSE"],
            executables: [],
          }),
        ),
      } as unknown as IArchiveExtractor;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.zip",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(!result.success);
      expect(result.error).toBe("No .dmg file found in extracted archive");
    });

    it("should return failure when archive extraction fails", async () => {
      const { shell } = createMockShell();
      mockArchiveExtractor = {
        extract: mock(() => Promise.reject(new Error("Extraction failed"))),
      } as unknown as IArchiveExtractor;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.zip",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(!result.success);
      expect(result.error).toBe("Extraction failed");
    });

    it("should clean up both archive and extracted .dmg", async () => {
      const { shell } = createMockShell();
      const rmMock = mock(() => Promise.resolve());
      mockFs = {
        ...mockFs,
        ensureDir: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.resolve(["TestApp.app"])),
        symlink: mock(() => Promise.resolve()),
        exists: mock(() => Promise.resolve(true)),
        rm: rmMock,
      } as unknown as IFileSystem;
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.zip",
          },
        },
      };

      const result = await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      assert(result.success);
      expect(rmMock).toHaveBeenCalledWith("/install/staging/TestApp.dmg");
      expect(rmMock).toHaveBeenCalledWith("/install/staging/TestApp.zip");
    });

    it("should not call archiveExtractor for direct .dmg URL", async () => {
      const { shell } = createMockShell();
      const toolConfig: DmgToolConfig = {
        name: "test-app",
        version: "1.0.0",
        binaries: ["test-app"],
        installationMethod: "dmg",
        installParams: {
          source: {
            type: "url",
            url: "https://example.com/TestApp.dmg",
          },
        },
      };

      await installFromDmg(
        "test-app",
        toolConfig,
        context,
        undefined,
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        logger,
        shell,
      );

      expect(mockArchiveExtractor.extract).not.toHaveBeenCalled();
    });
  });
});
