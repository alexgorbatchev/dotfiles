import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { Architecture, type IInstallContext, Platform } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import type { ICargoClient } from "../cargo-client";
import { installFromCargo } from "../installFromCargo";
import type { CargoToolConfig } from "../schemas";

function createTestContext(): IInstallContext {
  return {
    toolName: "test-tool",
    currentDir: "/path/to/tools/test-tool",
    stagingDir: "/tmp/staging",
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      hostname: "test-host",
    },
    projectConfig: {
      paths: {
        generatedDir: "/tmp/generated",
      },
    },
  } as IInstallContext;
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

function createMockCargoClient(): ICargoClient {
  return {
    getLatestVersion: mock(async () => "1.2.3"),
  } as unknown as ICargoClient;
}

function createMockArchiveExtractor(): IArchiveExtractor {
  return {
    extract: mock(async () => ({
      extractedFiles: ["test-tool/bin/test-tool"],
      executables: ["test-tool/bin/test-tool"],
    })),
  } as unknown as IArchiveExtractor;
}

function createMockHookExecutor(): HookExecutor {
  return {
    createEnhancedContext: mock((context: unknown) => context),
    executeHook: mock(async () => ({ success: true })),
  } as unknown as HookExecutor;
}

describe("installFromCargo", () => {
  let logger: TestLogger;
  let context: IInstallContext;
  let fs: IFileSystem;
  let downloader: IDownloader;
  let cargoClient: ICargoClient;
  let archiveExtractor: IArchiveExtractor;
  let hookExecutor: HookExecutor;

  beforeEach(() => {
    logger = new TestLogger();
    context = createTestContext();
    fs = createMockFs();
    downloader = createMockDownloader();
    cargoClient = createMockCargoClient();
    archiveExtractor = createMockArchiveExtractor();
    hookExecutor = createMockHookExecutor();
  });

  it("extracts cargo archives into a dedicated subdirectory before scanning for binaries", async () => {
    const toolConfig: CargoToolConfig = {
      name: "test-tool",
      version: "latest",
      binaries: ["test-tool"],
      installationMethod: "cargo",
      installParams: {
        crateName: "test-tool",
        versionSource: "crates-io",
      },
    };

    const result = await installFromCargo(
      "test-tool",
      toolConfig,
      context,
      undefined,
      fs,
      downloader,
      cargoClient,
      archiveExtractor,
      hookExecutor,
      logger,
      "https://github.com",
    );

    const downloadPath = path.join(context.stagingDir, "test-tool-1.2.3.tar.gz");
    const extractDir = path.join(context.stagingDir, "extracted");
    const extractCall = (archiveExtractor.extract as ReturnType<typeof mock>).mock.calls[0];

    expect(result.success).toBe(true);
    assert(extractCall);
    expect(extractCall[1]).toBe(downloadPath);
    expect(extractCall[2]).toEqual({ targetDir: extractDir });
  });
});
