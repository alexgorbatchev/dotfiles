import type { IInstallContext, IShell } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { installFromPacman } from "../installFromPacman";
import type { PacmanToolConfig } from "../schemas";
import { createMockShell } from "./helpers/mocks";

const originalBunSpawn = Bun.spawn;
const originalStdinIsTTY = process.stdin.isTTY;
const originalStderrIsTTY = process.stderr.isTTY;
const originalStderrWrite = process.stderr.write;

type MockShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  code: number;
  toString: () => string;
};

type StderrChunk = string | Uint8Array;

function createShellResult(stdout: string): MockShellResult {
  return {
    stdout,
    stderr: "",
    exitCode: 0,
    code: 0,
    toString: () => stdout,
  };
}

function mockBunSpawn(): ReturnType<typeof mock> {
  const spawnMock = mock((..._args: unknown[]) => ({
    exited: Promise.resolve(0),
    pid: 99999,
    kill: () => {},
  }));
  Bun.spawn = spawnMock as unknown as typeof Bun.spawn;
  return spawnMock;
}

function createMockFileSystem(): IFileSystem {
  return {
    ensureDir: mock(() => Promise.resolve()),
    exists: mock(() => Promise.resolve(false)),
    rm: mock(() => Promise.resolve()),
    symlink: mock(() => Promise.resolve()),
  } as unknown as IFileSystem;
}

function createMockContext(toolConfig: PacmanToolConfig, mockShell: IShell): IInstallContext {
  return {
    projectConfig: {
      paths: {
        binariesDir: "/bin",
        shellScriptsDir: "/scripts",
        dotfilesDir: "/dotfiles",
        generatedDir: "/generated",
        homeDir: "/home",
        targetDir: "/generated/bin-default",
        hostname: "test-host",
      },
    },
    systemInfo: {
      platform: "linux",
      arch: "x64",
    },
    toolName: "ripgrep",
    toolDir: "/tool/dir",
    getToolDir: () => "/tool/dir",
    homeDir: "/home",
    hostname: "test-host",
    binDir: "/bin",
    shellScriptsDir: "/scripts",
    dotfilesDir: "/dotfiles",
    generatedDir: "/generated",
    stagingDir: "/staging/dir",
    timestamp: "2023-01-01",
    $: mockShell,
    fileSystem: createMockFileSystem(),
    toolConfig,
  } as unknown as IInstallContext;
}

describe("installFromPacman", () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
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

  it("installs latest package without system upgrade by default", async () => {
    const commands: string[] = [];
    const results: MockShellResult[] = [
      createShellResult(""),
      createShellResult("/usr/bin/rg\n"),
      createShellResult("ripgrep 13.0.0-1"),
    ];
    const shell = createMockShell((cmd) => {
      commands.push(cmd);
      const result = results.shift();
      assert(result);
      return result;
    });
    const toolConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "latest",
      binaries: ["rg"],
      installationMethod: "pacman",
      installParams: {
        package: "ripgrep",
      },
    };

    const context = createMockContext(toolConfig, shell);
    const result = await installFromPacman("ripgrep", toolConfig, context, undefined, logger, shell, shell);

    assert(result.success);
    expect(result.version).toBe("13.0.0-1");
    expect(result.binaryPaths).toEqual(["/usr/bin/rg"]);
    expect(commands).toMatchInlineSnapshot(`
      [
        "pacman -S --needed --noconfirm ripgrep",
        "command -v rg",
        "pacman -Q ripgrep",
      ]
    `);
  });

  it("installs an exact package version and runs sysupgrade when requested", async () => {
    const commands: string[] = [];
    const results: MockShellResult[] = [createShellResult(""), createShellResult("")];
    const shell = createMockShell((cmd) => {
      commands.push(cmd);
      const result = results.shift();
      assert(result);
      return result;
    });
    const toolConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      installationMethod: "pacman",
      installParams: {
        package: "ripgrep",
        version: "13.0.0-1",
        sysupgrade: true,
      },
    };

    const context = createMockContext(toolConfig, shell);
    const result = await installFromPacman("ripgrep", toolConfig, context, undefined, logger, shell, shell);

    assert(result.success);
    expect(result.version).toBe("13.0.0-1");
    expect(commands).toMatchInlineSnapshot(`
      [
        "pacman -Syu --needed --noconfirm ripgrep=13.0.0-1",
      ]
    `);
  });

  it("uses the tool name when package is omitted", async () => {
    const commands: string[] = [];
    const results: MockShellResult[] = [createShellResult(""), createShellResult("ripgrep 13.0.0-1")];
    const shell = createMockShell((cmd) => {
      commands.push(cmd);
      const result = results.shift();
      assert(result);
      return result;
    });
    const toolConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "latest",
      installationMethod: "pacman",
      installParams: {},
    };

    const context = createMockContext(toolConfig, shell);
    const result = await installFromPacman("ripgrep", toolConfig, context, undefined, logger, shell, shell);

    assert(result.success);
    expect(commands).toMatchInlineSnapshot(`
      [
        "pacman -S --needed --noconfirm ripgrep",
        "pacman -Q ripgrep",
      ]
    `);
  });

  it("queries installed version by local package name when sync target is repo-qualified", async () => {
    const commands: string[] = [];
    const results: MockShellResult[] = [
      createShellResult(""),
      createShellResult("/usr/bin/rg\n"),
      createShellResult("ripgrep 13.0.0-1"),
    ];
    const shell = createMockShell((cmd) => {
      commands.push(cmd);
      const result = results.shift();
      assert(result);
      return result;
    });
    const toolConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "latest",
      binaries: ["rg"],
      installationMethod: "pacman",
      installParams: {
        package: "extra/ripgrep",
      },
    };

    const context = createMockContext(toolConfig, shell);
    const result = await installFromPacman("ripgrep", toolConfig, context, undefined, logger, shell, shell);

    assert(result.success);
    expect(result.version).toBe("13.0.0-1");
    expect(commands).toMatchInlineSnapshot(`
      [
        "pacman -S --needed --noconfirm extra/ripgrep",
        "command -v rg",
        "pacman -Q ripgrep",
      ]
    `);
  });

  it("runs install through sudo when configured", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.stderr.write = mock((_chunk: StderrChunk) => true) as typeof process.stderr.write;
    const spawnMock = mockBunSpawn();
    const shell = createMockShell();
    const toolConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      sudo: true,
      installationMethod: "pacman",
      installParams: {
        package: "ripgrep",
        version: "13.0.0-1",
        sysupgrade: true,
      },
    };

    const context = createMockContext(toolConfig, shell);
    const result = await installFromPacman("ripgrep", toolConfig, context, undefined, logger, shell, shell);

    assert(result.success);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls).toEqual([
      [
        {
          cmd: [
            "sudo",
            "-p",
            "Please enter your password to continue:",
            "--",
            "pacman",
            "-Syu",
            "--needed",
            "--noconfirm",
            "ripgrep=13.0.0-1",
          ],
          cwd: "/staging/dir",
          env: process.env,
          stdio: ["inherit", "inherit", "inherit"],
        },
      ],
    ]);
  });
});
