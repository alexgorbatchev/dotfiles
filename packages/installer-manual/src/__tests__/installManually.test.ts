import { Platform, type IInstallContext } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { installManually } from "../installManually";
import type { ManualToolConfig } from "../schemas";

const originalBunSpawn = Bun.spawn;
const originalStdinIsTTY = process.stdin.isTTY;
const originalStderrIsTTY = process.stderr.isTTY;

function createTextStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function mockBunSpawn(code: number = 0): ReturnType<typeof mock> {
  const spawnMock = mock((..._args: unknown[]) => ({
    stdout: createTextStream(""),
    stderr: createTextStream(""),
    exited: Promise.resolve(code),
    pid: 99999,
    kill: () => {},
  }));
  Bun.spawn = spawnMock as unknown as typeof Bun.spawn;
  return spawnMock;
}

describe("installManually", () => {
  let logger: TestLogger;
  let mockFs: IFileSystem;
  let context: IInstallContext;

  beforeEach(() => {
    mockBunSpawn();
    logger = new TestLogger();
    mockFs = {
      exists: mock((filePath: string) => Promise.resolve(filePath === "/usr/bin/whoami")),
      ensureDir: mock(() => Promise.resolve()),
      copyFile: mock(() => Promise.resolve()),
      chmod: mock(() => Promise.resolve()),
    } as unknown as IFileSystem;
    context = {
      stagingDir: "/install/staging",
      version: "1.0.0",
      systemInfo: { platform: Platform.Linux },
      projectConfig: {
        system: {
          sudoPrompt: "Enter dotfiles password:",
        },
        paths: {
          homeDir: "/home/user",
          dotfilesDir: "/home/user/.dotfiles",
          binariesDir: "/home/user/.dotfiles/.generated/binaries",
          generatedDir: "/home/user/.dotfiles/.generated",
          targetDir: "/home/user/.local/bin",
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

  it("should validate sudo access before manual installation", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    const spawnMock = mockBunSpawn();

    const toolConfig: ManualToolConfig = {
      name: "sudo-prompt-test",
      version: "1.0.0",
      sudo: true,
      binaries: ["sudo-prompt-test"],
      installationMethod: "manual",
      installParams: {
        binaryPath: "/usr/bin/whoami",
      },
      configFilePath: "/home/user/.dotfiles/tools/manual--sudo-prompt-test.tool.ts",
    };

    const result = await installManually("sudo-prompt-test", toolConfig, context, undefined, mockFs, logger);

    assert(result.success);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[0]).toEqual({
      cmd: ["sudo", "-p", "Enter dotfiles password:", "-v"],
      cwd: "/install/staging",
      env: process.env,
      stdio: ["inherit", "inherit", "inherit"],
    });
    expect(mockFs.copyFile).toHaveBeenCalledWith("/usr/bin/whoami", "/install/staging/sudo-prompt-test");
  });

  it("should fail when sudo is requested without an interactive terminal", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });

    const toolConfig: ManualToolConfig = {
      name: "sudo-prompt-test",
      version: "1.0.0",
      sudo: true,
      binaries: ["sudo-prompt-test"],
      installationMethod: "manual",
      installParams: {
        binaryPath: "/usr/bin/whoami",
      },
      configFilePath: "/home/user/.dotfiles/tools/manual--sudo-prompt-test.tool.ts",
    };

    const result = await installManually("sudo-prompt-test", toolConfig, context, undefined, mockFs, logger);

    assert(!result.success);
    expect(result.error).toBe('Tool "sudo-prompt-test" requires an interactive terminal for sudo installation');
  });
});
