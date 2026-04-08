import type { IInstallContext, Shell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { installFromCurlBinary } from "../installFromCurlBinary";
import type { CurlBinaryToolConfig } from "../schemas";

interface ICurlBinaryShellMocks {
  shell: Shell;
  mockFn: ReturnType<typeof mock>;
  mockEnv: ReturnType<typeof mock>;
  mockQuiet: ReturnType<typeof mock>;
}

function createMockShell(): ICurlBinaryShellMocks {
  const mockQuiet = mock(() => Promise.resolve({ stdout: "", stderr: "" }));
  const mockEnv = mock(() => ({ quiet: mockQuiet }));
  const mockFn = mock(() => ({ env: mockEnv }));
  return { shell: mockFn as unknown as Shell, mockFn, mockEnv, mockQuiet };
}

describe("installFromCurlBinary", () => {
  let logger: TestLogger;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockHookExecutor: HookExecutor;
  let context: IInstallContext;

  beforeEach(() => {
    logger = new TestLogger();
    mockFs = {
      chmod: mock(() => Promise.resolve()),
      exists: mock(() => Promise.resolve(true)),
      copyFile: mock(() => Promise.resolve()),
      rm: mock(() => Promise.resolve()),
    } as unknown as IFileSystem;
    mockDownloader = {
      download: mock(() => Promise.resolve("/path/to/download")),
    } as unknown as IDownloader;
    mockHookExecutor = {
      executeHook: mock(() => Promise.resolve({ success: true })),
    } as unknown as HookExecutor;
    context = {
      stagingDir: "/install/dir",
      version: "1.0.0",
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

  it("should return failure when url is missing from installParams", async () => {
    const { shell } = createMockShell();
    const toolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "curl-binary",
      installParams: {},
    } as unknown as CurlBinaryToolConfig;

    const result = await installFromCurlBinary(
      "test-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(!result.success);
    expect(result.error).toBe("URL not specified in installParams");
  });

  it("should download binary and set up paths", async () => {
    const { shell } = createMockShell();
    const toolConfig: CurlBinaryToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "curl-binary",
      installParams: {
        url: "https://example.com/test-tool-v1.0.0-linux-amd64",
      },
    };

    const result = await installFromCurlBinary(
      "test-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(result.success);
    expect(result.binaryPaths).toEqual(["/install/dir/test-tool"]);
    expect(result.metadata.method).toBe("curl-binary");
    expect(result.metadata.binaryUrl).toBe("https://example.com/test-tool-v1.0.0-linux-amd64");
    expect(result.metadata.downloadUrl).toBe("https://example.com/test-tool-v1.0.0-linux-amd64");
  });

  it("should call downloader with correct parameters", async () => {
    const { shell } = createMockShell();
    const downloadMock = mock(() => Promise.resolve());
    mockDownloader = { download: downloadMock } as unknown as IDownloader;

    const toolConfig: CurlBinaryToolConfig = {
      name: "my-tool",
      version: "2.0.0",
      binaries: ["my-tool"],
      installationMethod: "curl-binary",
      installParams: {
        url: "https://example.com/my-tool-linux",
      },
    };

    await installFromCurlBinary(
      "my-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it("should return failure when afterDownload hook fails", async () => {
    const { shell } = createMockShell();
    mockHookExecutor = {
      executeHook: mock(() => Promise.resolve({ success: false, error: "hook error" })),
      createEnhancedContext: mock((ctx: unknown) => ctx),
    } as unknown as HookExecutor;

    const toolConfig: CurlBinaryToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "curl-binary",
      installParams: {
        url: "https://example.com/test-tool",
        hooks: {
          "after-download": [async () => {}],
        },
      },
    };

    const result = await installFromCurlBinary(
      "test-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(!result.success);
    expect(result.error).toBe("afterDownload hook failed: hook error");
  });

  it("should use configured version when version detection fails", async () => {
    const { shell } = createMockShell();
    const toolConfig: CurlBinaryToolConfig = {
      name: "test-tool",
      version: "3.2.1",
      binaries: ["test-tool"],
      installationMethod: "curl-binary",
      installParams: {
        url: "https://example.com/test-tool",
      },
    };

    const result = await installFromCurlBinary(
      "test-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(result.success);
    expect(result.version).toBe("3.2.1");
  });

  it("should not use version from config when version is latest", async () => {
    const { shell } = createMockShell();
    const toolConfig: CurlBinaryToolConfig = {
      name: "test-tool",
      version: "latest",
      binaries: ["test-tool"],
      installationMethod: "curl-binary",
      installParams: {
        url: "https://example.com/test-tool",
      },
    };

    const result = await installFromCurlBinary(
      "test-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(result.success);
    expect(result.version).toBeUndefined();
  });

  it("should handle download errors gracefully", async () => {
    const { shell } = createMockShell();
    mockDownloader = {
      download: mock(() => Promise.reject(new Error("Network error"))),
    } as unknown as IDownloader;

    const toolConfig: CurlBinaryToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      binaries: ["test-tool"],
      installationMethod: "curl-binary",
      installParams: {
        url: "https://example.com/test-tool",
      },
    };

    const result = await installFromCurlBinary(
      "test-tool",
      toolConfig,
      context,
      undefined,
      mockFs,
      mockDownloader,
      mockHookExecutor,
      logger,
      shell,
    );

    assert(!result.success);
    expect(result.error).toBe("Network error");
  });
});
