import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { Architecture, type IInstallContext, Platform, type IShell } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import { createMemFileSystem, type IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import { installFromCurlTar } from "../installFromCurlTar";
import type { CurlTarToolConfig } from "../schemas";

interface ICurlTarShellMocks {
  shell: IShell;
  mockFn: ReturnType<typeof mock>;
  mockEnv: ReturnType<typeof mock>;
  mockQuiet: ReturnType<typeof mock>;
  mockNoThrow: ReturnType<typeof mock>;
}

type AsyncHook = (context: unknown) => Promise<void>;

function createMockShell(): ICurlTarShellMocks {
  const mockNoThrow = mock(async () => ({ stdout: "", stderr: "" }));
  const mockQuiet = mock(() => ({ noThrow: mockNoThrow }));
  const mockEnv = mock(() => ({ quiet: mockQuiet }));
  const mockFn = mock(() => ({ env: mockEnv }));

  return {
    shell: mockFn as unknown as IShell,
    mockFn,
    mockEnv,
    mockQuiet,
    mockNoThrow,
  };
}

describe("installFromCurlTar", () => {
  let logger: TestLogger;
  let fs: IFileSystem;
  let downloader: IDownloader;
  let hookExecutor: HookExecutor;
  let context: IInstallContext;

  beforeEach(async () => {
    logger = new TestLogger();
    ({ fs } = await createMemFileSystem());

    downloader = {
      download: mock(async (_parentLogger, _url, options) => {
        const destinationPath = options?.destinationPath;
        assert(destinationPath);

        await fs.ensureDir(path.dirname(destinationPath));
        await fs.writeFile(destinationPath, "mock archive");
      }),
      registerStrategy: mock(() => {}),
      downloadToFile: mock(async () => {}),
    } as unknown as IDownloader;

    hookExecutor = {
      createEnhancedContext: mock((hookContext: unknown) => hookContext),
      executeHook: mock(async (_parentLogger, _hookName, hook, hookContext) => {
        const callback = hook as AsyncHook;
        await callback(hookContext);
        return { success: true };
      }),
    } as unknown as HookExecutor;

    context = {
      toolName: "go",
      currentDir: "/tmp/generated/binaries/go/current",
      stagingDir: "/tmp/generated/binaries/go/install-attempt",
      version: "1.26.2",
      systemInfo: {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: "/Users/test",
        hostname: "test-host",
      },
      projectConfig: {
        paths: {
          generatedDir: "/tmp/generated",
          binariesDir: "/tmp/generated/binaries",
          homeDir: "/Users/test",
          dotfilesDir: "/Users/test/.dotfiles",
          targetDir: "/Users/test/.local/bin",
          toolConfigsDir: "/Users/test/.dotfiles/tools",
          shellScriptsDir: "/Users/test/.dotfiles/.generated/shell-scripts",
        },
      },
    } as unknown as IInstallContext;

    await fs.ensureDir(context.stagingDir);
  });

  it("extracts into a dedicated subdirectory so binary entrypoints cannot collide with archive roots", async () => {
    const extract = mock(async (_parentLogger, _archivePath, options) => {
      const extractDir = options?.targetDir;
      assert(extractDir);

      const goBinaryPath = path.join(extractDir, "go", "bin", "go");
      const gofmtBinaryPath = path.join(extractDir, "go", "bin", "gofmt");

      await fs.ensureDir(path.dirname(goBinaryPath));
      await fs.writeFile(goBinaryPath, "#!/bin/sh\nexit 0\n");
      await fs.writeFile(gofmtBinaryPath, "#!/bin/sh\nexit 0\n");
      await fs.chmod(goBinaryPath, 0o755);
      await fs.chmod(gofmtBinaryPath, 0o755);

      return {
        extractedFiles: ["go/bin/go", "go/bin/gofmt"],
        executables: ["go/bin/go", "go/bin/gofmt"],
      };
    });

    const archiveExtractor: IArchiveExtractor = {
      extract,
      detectFormat: mock(async () => "tar.gz"),
      isSupported: mock(() => true),
    } as unknown as IArchiveExtractor;

    const toolConfig: CurlTarToolConfig = {
      name: "go",
      version: "1.26.2",
      binaries: [
        { name: "go", pattern: "go/bin/go" },
        { name: "gofmt", pattern: "go/bin/gofmt" },
      ],
      installationMethod: "curl-tar",
      installParams: {
        url: "https://example.com/go.tar.gz",
      },
    };

    const { shell } = createMockShell();

    const result = await installFromCurlTar(
      "go",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      archiveExtractor,
      hookExecutor,
      logger,
      shell,
    );

    const extractDir = path.join(context.stagingDir, "extracted");
    const goEntrypointPath = path.join(context.stagingDir, "go");
    const gofmtEntrypointPath = path.join(context.stagingDir, "gofmt");

    assert(result.success, JSON.stringify(result));
    expect(extract).toHaveBeenCalledWith(
      expect.anything(),
      path.join(context.stagingDir, "go.tar.gz"),
      expect.objectContaining({ targetDir: extractDir }),
    );
    expect(result.binaryPaths).toEqual([goEntrypointPath, gofmtEntrypointPath]);
    expect(await fs.readlink(goEntrypointPath)).toBe("extracted/go/bin/go");
    expect(await fs.readlink(gofmtEntrypointPath)).toBe("extracted/go/bin/gofmt");
  });
});
