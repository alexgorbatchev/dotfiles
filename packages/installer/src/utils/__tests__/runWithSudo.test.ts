import { Platform, type IInstallContext } from "@dotfiles/core";
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { runWithSudo } from "../runWithSudo";

const originalBunSpawn = Bun.spawn;
const originalStdinIsTTY = process.stdin.isTTY;
const originalStderrIsTTY = process.stderr.isTTY;
const originalStderrWrite = process.stderr.write;

type StderrChunk = string | Uint8Array;

function createTextStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function createContext(): IInstallContext {
  return {
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
}

describe("runWithSudo", () => {
  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  });

  afterEach(() => {
    Bun.spawn = originalBunSpawn;
    process.stderr.write = originalStderrWrite;
    Object.defineProperty(process.stdin, "isTTY", { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: originalStderrIsTTY, configurable: true });
  });

  afterAll(() => {
    Bun.spawn = originalBunSpawn;
    process.stderr.write = originalStderrWrite;
    Object.defineProperty(process.stdin, "isTTY", { value: originalStdinIsTTY, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: originalStderrIsTTY, configurable: true });
  });

  it("writes an explanation before prompting for sudo", async () => {
    const spawnMock = mock((..._args: unknown[]) => ({
      stdout: createTextStream(""),
      stderr: createTextStream(""),
      exited: Promise.resolve(0),
      pid: 99999,
      kill: () => {},
    }));
    Bun.spawn = spawnMock as unknown as typeof Bun.spawn;

    const mockStderrWrite = mock((_chunk: StderrChunk) => true);
    process.stderr.write = mockStderrWrite as typeof process.stderr.write;

    await runWithSudo("sudo-prompt-test", createContext());

    expect(mockStderrWrite).toHaveBeenCalledWith(
      'Tool "sudo-prompt-test" requires sudo privileges because it is configured with `sudo()`.\n',
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
