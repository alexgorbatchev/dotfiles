import type { IInstallContext, IShell } from "@dotfiles/core";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { installFromNpm } from "../installFromNpm";
import type { NpmToolConfig } from "../schemas";
import { createFailingMockShell, createMockShell } from "./helpers/mocks";

type MockShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  code: number;
  toString: () => string;
};

type MockShellCommandOutput = {
  includes: string;
  stdout: string;
};

function createMockShellResult(stdout: string): MockShellResult {
  return {
    stdout,
    stderr: "",
    exitCode: 0,
    code: 0,
    toString: () => stdout,
  };
}

function createCommandShell(commandOutputs: MockShellCommandOutput[]): IShell {
  return createMockShell((cmd: string) => {
    const matchedOutput = commandOutputs.find((entry) => cmd.includes(entry.includes));
    return createMockShellResult(matchedOutput?.stdout ?? "");
  });
}

function createContext(toolConfig: NpmToolConfig, mockShell: IShell): IInstallContext {
  return {
    projectConfig: {
      paths: {
        binariesDir: "/bin",
        shellScriptsDir: "/scripts",
        dotfilesDir: "/dotfiles",
        generatedDir: "/generated",
        homeDir: "/home",
        hostname: "test-host",
      },
    },
    systemInfo: {
      platform: "darwin",
      arch: "arm64",
    },
    toolName: toolConfig.name,
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
    fileSystem: {} as IInstallContext["fileSystem"],
    toolConfig: toolConfig,
  } as unknown as IInstallContext;
}

describe("installFromNpm", () => {
  let logger: TestLogger;
  let mockShell: IShell;

  beforeEach(() => {
    logger = new TestLogger();
    mockShell = createMockShell();
  });

  it("should install npm package globally and detect version", async () => {
    const toolConfig: NpmToolConfig = {
      name: "prettier",
      version: "3.1.0",
      binaries: ["prettier"],
      installationMethod: "npm",
      installParams: {
        package: "prettier",
      },
    };

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm("prettier", toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.version).toBe("3.1.0");
    expect(result.metadata.packageName).toBe("prettier");
    expect(result.metadata.method).toBe("npm");
    expect(result.binaryPaths).toEqual(["/mock/global/bin/prettier"]);
  });

  it("should use tool name as package name when package is not specified", async () => {
    const toolConfig: NpmToolConfig = {
      name: "prettier",
      version: "3.1.0",
      binaries: ["prettier"],
      installationMethod: "npm",
      installParams: {},
    };

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm("prettier", toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.metadata.packageName).toBe("prettier");
  });

  it("should fail when installParams is missing", async () => {
    const toolConfig = {
      name: "prettier",
      version: "3.1.0",
      binaries: ["prettier"],
      installationMethod: "npm",
    } as unknown as NpmToolConfig;

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm("prettier", toolConfig, context, undefined, logger, mockShell);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBe("Install parameters not specified");
  });

  it("should use versionArgs and versionRegex for custom version detection", async () => {
    const versionShell = createCommandShell([
      { includes: "npm install -g", stdout: "" },
      { includes: "npm prefix -g", stdout: "/mock/global" },
      { includes: "--version", stdout: "mytool v4.2.1" },
    ]);

    const toolConfig: NpmToolConfig = {
      name: "mytool",
      version: "4.2.1",
      binaries: ["mytool"],
      installationMethod: "npm",
      installParams: {
        package: "mytool",
        versionArgs: ["--version"],
        versionRegex: /v(\d+\.\d+\.\d+)/,
      },
    };

    const context = createContext(toolConfig, versionShell);
    const result = await installFromNpm("mytool", toolConfig, context, undefined, logger, versionShell, versionShell);

    assert(result.success);
    expect(result.version).toBe("4.2.1");
    expect(result.metadata.packageName).toBe("mytool");
  });

  it("should return failure when npm install command fails", async () => {
    const failShell = createFailingMockShell();

    const toolConfig: NpmToolConfig = {
      name: "failing-tool",
      version: "1.0.0",
      binaries: ["failing-tool"],
      installationMethod: "npm",
      installParams: {
        package: "failing-tool",
      },
    };

    const context = createContext(toolConfig, failShell);
    const result = await installFromNpm("failing-tool", toolConfig, context, undefined, logger, failShell, failShell);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBeDefined();
  });

  it("should install with bun globally and detect version via CLI", async () => {
    const toolConfig: NpmToolConfig = {
      name: "prettier",
      version: "3.1.0",
      binaries: ["prettier"],
      installationMethod: "npm",
      installParams: {
        package: "prettier",
        packageManager: "bun",
      },
    };

    const context = createContext(toolConfig, mockShell);
    const result = await installFromNpm("prettier", toolConfig, context, undefined, logger, mockShell, mockShell);

    assert(result.success);
    expect(result.version).toBe("3.1.0");
    expect(result.metadata.packageName).toBe("prettier");
    expect(result.metadata.method).toBe("npm");
    expect(result.binaryPaths).toEqual(["/mock/global/bin/prettier"]);
  });

  it("should use bun install -g command when packageManager is bun", async () => {
    const commands: string[] = [];
    const capturingShell = createMockShell((cmd: string) => {
      commands.push(cmd);
      const matchedOutput = [
        { includes: "bun pm bin -g", stdout: "/mock/global/bin" },
        { includes: "--version", stdout: "3.1.0" },
      ].find((entry) => cmd.includes(entry.includes));
      return createMockShellResult(matchedOutput?.stdout ?? "");
    });

    const toolConfig: NpmToolConfig = {
      name: "prettier",
      version: "3.1.0",
      binaries: ["prettier"],
      installationMethod: "npm",
      installParams: {
        package: "prettier",
        packageManager: "bun",
      },
    };

    const context = createContext(toolConfig, capturingShell);
    await installFromNpm("prettier", toolConfig, context, undefined, logger, capturingShell, capturingShell);

    const installCommand = commands.find((cmd) => cmd.includes("bun install -g"));
    expect(installCommand).toBeDefined();
    expect(installCommand).toBe("bun install -g prettier");
  });

  it("should default to npm install -g when packageManager is unset", async () => {
    const commands: string[] = [];
    const capturingShell = createMockShell((cmd: string) => {
      commands.push(cmd);
      const matchedOutput = [
        { includes: "npm prefix -g", stdout: "/mock/global" },
        { includes: "npm view", stdout: "3.1.0" },
      ].find((entry) => cmd.includes(entry.includes));
      return createMockShellResult(matchedOutput?.stdout ?? "");
    });

    const toolConfig: NpmToolConfig = {
      name: "prettier",
      version: "3.1.0",
      binaries: ["prettier"],
      installationMethod: "npm",
      installParams: {
        package: "prettier",
      },
    };

    const context = createContext(toolConfig, capturingShell);
    await installFromNpm("prettier", toolConfig, context, undefined, logger, capturingShell, capturingShell);

    const installCommand = commands.find((cmd) => cmd.includes("npm install -g"));
    expect(installCommand).toBeDefined();
    expect(commands.some((cmd) => cmd.includes("bun install -g"))).toBe(false);
  });

  it("should return failure when bun install -g command fails", async () => {
    const failShell = createFailingMockShell();

    const toolConfig: NpmToolConfig = {
      name: "failing-tool",
      version: "1.0.0",
      binaries: ["failing-tool"],
      installationMethod: "npm",
      installParams: {
        package: "failing-tool",
        packageManager: "bun",
      },
    };

    const context = createContext(toolConfig, failShell);
    const result = await installFromNpm("failing-tool", toolConfig, context, undefined, logger, failShell, failShell);

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toBeDefined();
  });
});
