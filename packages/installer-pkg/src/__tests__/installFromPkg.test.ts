import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { Platform, type IInstallContext, type IShell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import { TestLogger } from "@dotfiles/logger";
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { installFromPkg } from "../installFromPkg";
import type { PkgToolConfig } from "../schemas";

const originalBunSpawn = Bun.spawn;
const originalStdinIsTTY = process.stdin.isTTY;
const originalStderrIsTTY = process.stderr.isTTY;

interface IMockBunSpawnOptions {
  stdout?: string;
  stderr?: string;
  code?: number;
}

function createTextStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function mockBunSpawn(options: IMockBunSpawnOptions = {}): ReturnType<typeof mock> {
  const { stdout = "", stderr = "", code = 0 } = options;
  const spawnMock = mock((..._args: unknown[]) => ({
    stdout: createTextStream(stdout),
    stderr: createTextStream(stderr),
    exited: Promise.resolve(code),
    pid: 99999,
    kill: () => {},
  }));
  Bun.spawn = spawnMock as unknown as typeof Bun.spawn;
  return spawnMock;
}

interface IPkgShellMocks {
  shell: IShell;
  mockQuiet: ReturnType<typeof mock>;
}

function createMockShell(): IPkgShellMocks {
  const mockQuiet = mock(() => Promise.resolve({ stdout: "", stderr: "" }));
  const mockFn = mock(() => ({ quiet: mockQuiet }));
  return { shell: mockFn as unknown as IShell, mockQuiet };
}

describe("installFromPkg", () => {
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
      readdir: mock(() => Promise.resolve(["TestTool.pkg"])),
      exists: mock((filePath: string) =>
        Promise.resolve(filePath === "/usr/local/bin/test-tool" || filePath.includes(".pkg")),
      ),
      rm: mock(() => Promise.resolve()),
    } as unknown as IFileSystem;
    mockDownloader = {
      download: mock(() => Promise.resolve()),
    } as unknown as IDownloader;
    mockArchiveExtractor = {
      extract: mock(() =>
        Promise.resolve({
          extractedFiles: ["/install/staging/TestTool.pkg"],
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
        system: {
          sudoPrompt: "Enter dotfiles password:",
        },
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
    Object.defineProperty(process.stdin, "isTTY", { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: originalStderrIsTTY, configurable: true });
  });

  afterAll(() => {
    Bun.spawn = originalBunSpawn;
    Object.defineProperty(process.stdin, "isTTY", { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: originalStderrIsTTY, configurable: true });
  });

  it("should install from a direct .pkg URL and resolve binaries from PATH", async () => {
    const { shell, mockQuiet } = createMockShell();
    mockQuiet.mockResolvedValueOnce({ stdout: "/usr/local/bin/test-tool\n", stderr: "" });

    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(result.binaryPaths).toEqual(["/usr/local/bin/test-tool"]);
    expect(result.metadata.method).toBe("pkg");
    expect(result.metadata.pkgUrl).toBe("https://example.com/TestTool.pkg");
    expect(mockFs.ensureDir).toHaveBeenCalledWith("/install/staging");
  });

  it("should use explicit binaryPath when provided", async () => {
    const { shell, mockQuiet } = createMockShell();

    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
        binaryPath: "/usr/local/bin/test-tool",
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(result.binaryPaths).toEqual(["/usr/local/bin/test-tool"]);
    expect(mockQuiet).toHaveBeenCalledTimes(0);
  });

  it("should surface installer output when macOS installer fails", async () => {
    mockBunSpawn({
      stdout: "installer: Must be run as root to install this package.\n",
      code: 1,
    });

    const { shell } = createMockShell();
    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(result.error).toBe("installer: Must be run as root to install this package.");
    logger.expect(["INFO"], ["installFromPkg"], [], ["| installer: Must be run as root to install this package."]);
  });

  it("should run installer via sudo when tool requires it", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });

    const spawnMock = mockBunSpawn();
    const { shell, mockQuiet } = createMockShell();
    mockQuiet.mockResolvedValueOnce({ stdout: "/usr/local/bin/test-tool\n", stderr: "" });

    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      sudo: true,
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[0]).toEqual({
      cmd: [
        "sudo",
        "-p",
        "Enter dotfiles password:",
        "--",
        "/usr/sbin/installer",
        "-pkg",
        "/install/staging/TestTool.pkg",
        "-target",
        "/",
      ],
      cwd: "/install/staging",
      env: process.env,
      stdio: ["inherit", "inherit", "inherit"],
    });
  });

  it("should fail when sudo installation is requested without a tty", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });

    const { shell } = createMockShell();
    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      sudo: true,
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(result.error).toBe('Tool "test-tool" requires an interactive terminal for sudo installation');
  });

  it("should skip installation on non-macOS", async () => {
    const { shell } = createMockShell();
    const nonMacContext = {
      ...context,
      systemInfo: { platform: Platform.Linux },
    } as unknown as IInstallContext;
    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "test-tool",
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

  it("should resolve and download PKG from github-release source", async () => {
    const { shell, mockQuiet } = createMockShell();
    mockQuiet.mockResolvedValueOnce({ stdout: "", stderr: "" });
    mockGitHubApiClient = {
      ...mockGitHubApiClient,
      getLatestRelease: mock(() =>
        Promise.resolve({
          tag_name: "v1.0.0",
          name: "v1.0.0",
          html_url: "https://github.com/example/tool/releases/tag/v1.0.0",
          published_at: "2026-01-01T00:00:00Z",
          assets: [
            {
              name: "tool-macos.pkg",
              browser_download_url: "https://github.com/example/tool/releases/download/v1.0.0/tool-macos.pkg",
            },
          ],
        }),
      ),
    } as unknown as IGitHubApiClient;

    const toolConfig: PkgToolConfig = {
      name: "tool",
      version: "latest",
      binaries: [],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "github-release",
          repo: "example/tool",
          assetPattern: "*macos*.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "tool",
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
    expect(result.metadata.pkgUrl).toBe("https://github.com/example/tool/releases/download/v1.0.0/tool-macos.pkg");
    expect(mockDownloader.download).toHaveBeenCalled();
  });

  it("should succeed without resolved binaries when they are not yet on PATH", async () => {
    const { shell, mockQuiet } = createMockShell();
    mockQuiet.mockResolvedValueOnce({ stdout: "", stderr: "" });
    mockQuiet.mockRejectedValueOnce(new Error("not found"));

    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(result.binaryPaths).toEqual([]);
  });

  it("should fail when explicit binaryPath does not exist", async () => {
    const { shell, mockQuiet } = createMockShell();
    mockQuiet.mockResolvedValueOnce({ stdout: "", stderr: "" });
    mockFs = {
      ...mockFs,
      exists: mock((filePath: string) => Promise.resolve(filePath.includes(".pkg"))),
    } as unknown as IFileSystem;

    const toolConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/TestTool.pkg",
        },
        binaryPath: "/usr/local/bin/test-tool",
      },
    };

    const result = await installFromPkg(
      "test-tool",
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
    expect(result.error).toContain("Configured pkg binaryPath does not exist after installation");
  });
});
