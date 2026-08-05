import type { IInstallContext, IShell } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import { installFromBrew } from "../installFromBrew";
import type { BrewToolConfig } from "../schemas";
import { createMockShell, type IMockShell } from "./helpers/mocks";

function createMockFileSystem(): IFileSystem {
  return {
    ensureDir: mock(() => Promise.resolve()),
    exists: mock(() => Promise.resolve(false)),
    rm: mock(() => Promise.resolve()),
    symlink: mock(() => Promise.resolve()),
  } as unknown as IFileSystem;
}

function createMockContext(toolConfig: BrewToolConfig, mockShell: IShell): IInstallContext {
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
      platform: "darwin",
      arch: "arm64",
    },
    toolName: "test-tool",
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

describe("installFromBrew", () => {
  let logger: TestLogger;
  let mockShell: IMockShell;

  beforeEach(() => {
    logger = new TestLogger();
    mockShell = createMockShell();
  });

  it("should detect version using brew info when versionArgs are not provided", async () => {
    const toolConfig: BrewToolConfig = {
      name: "test-tool",
      version: "1.2.3",
      installationMethod: "brew",
      installParams: {
        formula: "test-tool",
      },
    };

    const context = createMockContext(toolConfig, mockShell);
    const result = await installFromBrew("test-tool", toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.success).toBe(true);
    expect(result.version).toBe("1.2.3");
    expect(result.metadata.formula).toBe("test-tool");
  });

  it("should fall back to brew info for version when versionArgs provided but no binaries", async () => {
    const toolConfig: BrewToolConfig = {
      name: "test-tool",
      version: "1.2.3",
      installationMethod: "brew",
      installParams: {
        formula: "test-tool",
        versionArgs: ["--version"],
        versionRegex: /version (\d+\.\d+\.\d+)/,
      },
    };

    const context = createMockContext(toolConfig, mockShell);
    const result = await installFromBrew("test-tool", toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.success).toBe(true);
    expect(result.version).toBe("1.2.3");
  });

  it("should execute brew trust, tap, install with args, link, and service in order", async () => {
    const toolConfig: BrewToolConfig = {
      name: "deepgram-cli",
      version: "1.0.0",
      installationMethod: "brew",
      installParams: {
        formula: "deepgram-cli",
        trust: ["deepgram/tap"],
        tap: "deepgram/tap",
        args: ["--build-from-source"],
        link: { overwrite: true, force: true },
        service: "start",
      },
    };

    const context = createMockContext(toolConfig, mockShell);
    const result = await installFromBrew("deepgram-cli", toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.success).toBe(true);

    const trustCmd = mockShell.executedCommands.find((cmd) => cmd.includes("brew trust"));
    const tapCmd = mockShell.executedCommands.find((cmd) => cmd.includes("brew tap"));
    const installCmd = mockShell.executedCommands.find((cmd) => cmd.includes("brew install"));
    const linkCmd = mockShell.executedCommands.find((cmd) => cmd.includes("brew link"));
    const serviceCmd = mockShell.executedCommands.find((cmd) => cmd.includes("brew services"));

    expect(trustCmd).toBe("brew trust deepgram/tap");
    expect(tapCmd).toBe("brew tap deepgram/tap");
    expect(installCmd).toBe("brew install --build-from-source deepgram-cli");
    expect(linkCmd).toBe("brew link --overwrite --force deepgram-cli");
    expect(serviceCmd).toBe("brew services start deepgram-cli");

    // Verify execution sequence order
    const trustIndex = mockShell.executedCommands.indexOf(trustCmd!);
    const tapIndex = mockShell.executedCommands.indexOf(tapCmd!);
    const installIndex = mockShell.executedCommands.indexOf(installCmd!);
    const linkIndex = mockShell.executedCommands.indexOf(linkCmd!);
    const serviceIndex = mockShell.executedCommands.indexOf(serviceCmd!);

    expect(trustIndex).toBeLessThan(tapIndex);
    expect(tapIndex).toBeLessThan(installIndex);
    expect(installIndex).toBeLessThan(linkIndex);
    expect(linkIndex).toBeLessThan(serviceIndex);
  });
});
