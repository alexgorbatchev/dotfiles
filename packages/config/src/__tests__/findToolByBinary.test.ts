import type { ISystemInfo, ProjectConfig, ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import { NodeFileSystem, ResolvedFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createMockProjectConfig, createTestDirectories } from "@dotfiles/testing-helpers";
import { dedentString } from "@dotfiles/utils";
import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import { findToolByBinary, loadToolConfigByBinary, loadToolConfigs } from "../loadToolConfigs";

type CleanupFn = () => Promise<void>;

describe("findToolByBinary", () => {
  let logger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let systemInfo: ISystemInfo;
  let realFs: NodeFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let cleanupFn: CleanupFn;
  let testCounter = 0;

  async function setupTest(): Promise<void> {
    testCounter++;
    logger = new TestLogger();
    realFs = new NodeFileSystem();

    const testDirs = await createTestDirectories(logger, realFs, {
      testName: `find-by-binary-test-${testCounter}-${Date.now()}`,
    });
    cleanupFn = async () => {
      await realFs.rm(testDirs.paths.homeDir, { recursive: true, force: true });
    };

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    // Create a ResolvedFileSystem with the real homeDir
    resolvedFs = new ResolvedFileSystem(realFs, testDirs.paths.homeDir);

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem: realFs,
      logger,
      systemInfo,
      env: {},
    });

    // Ensure toolConfigsDir exists
    await realFs.mkdir(mockProjectConfig.paths.toolConfigsDir, { recursive: true });
  }

  afterEach(async () => {
    await cleanupFn();
  });

  async function createToolFile(toolName: string, binaryNames: string[]): Promise<void> {
    const toolConfigsDir = mockProjectConfig.paths.toolConfigsDir;
    const toolFilePath = path.join(toolConfigsDir, `${toolName}.tool.ts`);

    const binCalls = binaryNames.map((name) => `.bin('${name}')`).join("");

    // Use a simpler export that doesn't require external imports
    const content = `
      export default (install) =>
        install('manual', { binaryPath: '/usr/bin/${toolName}' })${binCalls};
    `;

    await realFs.writeFile(toolFilePath, content);
  }

  it("should find a tool by its binary name", async () => {
    await setupTest();
    await createToolFile("github-release--bat", ["bat"]);

    const result = await findToolByBinary(
      logger,
      "bat",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result.success);
    expect(result.toolName).toBe("github-release--bat");
  });

  it("should return not found when binary does not exist", async () => {
    await setupTest();
    await createToolFile("tool-a", ["binary-a"]);

    const result = await findToolByBinary(
      logger,
      "nonexistent-binary",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.matchingTools).toBeUndefined();
  });

  it("should return error when multiple tools provide the same binary", async () => {
    await setupTest();
    await createToolFile("tool-a", ["shared-binary"]);
    await createToolFile("tool-b", ["shared-binary"]);

    const result = await findToolByBinary(
      logger,
      "shared-binary",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.error).toContain("Multiple tools provide the binary 'shared-binary'");
    expect(result.matchingTools).toContain("tool-a");
    expect(result.matchingTools).toContain("tool-b");
  });

  it("should find tool with multiple binaries when searching for any of them", async () => {
    await setupTest();
    await createToolFile("multi-bin-tool", ["bin-one", "bin-two"]);

    const result1 = await findToolByBinary(
      logger,
      "bin-one",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result1.success);
    expect(result1.toolName).toBe("multi-bin-tool");

    const result2 = await findToolByBinary(
      logger,
      "bin-two",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result2.success);
    expect(result2.toolName).toBe("multi-bin-tool");
  });

  it("should return not found when tool configs directory does not exist", async () => {
    await setupTest();
    const nonExistentDir = "/nonexistent/path/to/tools";

    const result = await findToolByBinary(
      logger,
      "some-binary",
      nonExistentDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result.success).toBe(false);
    assert(!result.success);
    expect(result.matchingTools).toBeUndefined();
  });
});

describe("loadToolConfigByBinary", () => {
  let logger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let systemInfo: ISystemInfo;
  let realFs: NodeFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let cleanupFn: CleanupFn;
  let testCounter = 0;

  async function setupTest(): Promise<void> {
    testCounter++;
    logger = new TestLogger();
    realFs = new NodeFileSystem();

    const testDirs = await createTestDirectories(logger, realFs, {
      testName: `load-by-binary-test-${testCounter}-${Date.now()}`,
    });
    cleanupFn = async () => {
      await realFs.rm(testDirs.paths.homeDir, { recursive: true, force: true });
    };

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    // Create a ResolvedFileSystem with the real homeDir
    resolvedFs = new ResolvedFileSystem(realFs, testDirs.paths.homeDir);

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem: realFs,
      logger,
      systemInfo,
      env: {},
    });

    // Ensure toolConfigsDir exists
    await realFs.mkdir(mockProjectConfig.paths.toolConfigsDir, { recursive: true });
  }

  afterEach(async () => {
    await cleanupFn();
  });

  async function createToolFile(toolName: string, binaryNames: string[]): Promise<void> {
    const toolConfigsDir = mockProjectConfig.paths.toolConfigsDir;
    const toolFilePath = path.join(toolConfigsDir, `${toolName}.tool.ts`);

    const binCalls = binaryNames.map((name) => `.bin('${name}')`).join("");

    // Use a simpler export that doesn't require external imports
    const content = dedentString(`
      export default (install) =>
        install('manual', { binaryPath: '/usr/bin/${toolName}' })${binCalls};
    `);

    await realFs.writeFile(toolFilePath, content);
  }

  it("should load tool config by binary name", async () => {
    await setupTest();
    await createToolFile("my-tool", ["my-binary"]);

    const result = await loadToolConfigByBinary(
      logger,
      "my-binary",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result);
    assert(!("error" in result));
    const toolConfig = result as ToolConfig;
    expect(toolConfig.name).toBe("my-tool");
    expect(toolConfig.binaries).toContain("my-binary");
  });

  it("should load tool config when public authoring imports are nested in helper modules", async () => {
    await setupTest();

    const helperDir = path.join(mockProjectConfig.paths.toolConfigsDir, "helpers");
    const helperFilePath = path.join(helperDir, "nested-tool-helper.ts");
    const toolFilePath = path.join(mockProjectConfig.paths.toolConfigsDir, "nested-tool.tool.ts");

    await realFs.mkdir(helperDir, { recursive: true });
    await realFs.writeFile(
      helperFilePath,
      dedentString(`
        import { defineTool, Platform } from "@dotfiles/cli";

        export const createNestedTool = () =>
          defineTool((install, ctx) =>
            install("manual", {
              binaryPath: ctx.systemInfo.platform === Platform.Linux ? "/usr/bin/nested-tool" : "/usr/bin/nested-tool",
            })
              .bin("nested-tool")
              .version("latest"),
          );
      `),
    );
    await realFs.writeFile(
      toolFilePath,
      dedentString(`
        import { createNestedTool } from "./helpers/nested-tool-helper";

        export default createNestedTool();
      `),
    );

    const result = await loadToolConfigByBinary(
      logger,
      "nested-tool",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result);
    assert(!("error" in result));
    expect(result.name).toBe("nested-tool");
    expect(result.binaries).toContain("nested-tool");
  });

  it("should return undefined when binary is not found", async () => {
    await setupTest();
    await createToolFile("tool-a", ["binary-a"]);

    const result = await loadToolConfigByBinary(
      logger,
      "nonexistent",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    expect(result).toBeUndefined();
  });

  it("should return error object when multiple tools provide the same binary", async () => {
    await setupTest();
    await createToolFile("tool-a", ["duplicate-bin"]);
    await createToolFile("tool-b", ["duplicate-bin"]);

    const result = await loadToolConfigByBinary(
      logger,
      "duplicate-bin",
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );

    assert(result);
    assert("error" in result);
    expect(result.error).toContain("Multiple tools provide the binary 'duplicate-bin'");
  });
});

describe("loadToolConfigs", () => {
  let logger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let systemInfo: ISystemInfo;
  let realFs: NodeFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let cleanupFn: CleanupFn;
  let testCounter = 0;

  async function setupTest(): Promise<void> {
    testCounter++;
    logger = new TestLogger();
    realFs = new NodeFileSystem();

    const testDirs = await createTestDirectories(logger, realFs, {
      testName: `load-tool-configs-test-${testCounter}-${Date.now()}`,
    });
    cleanupFn = async () => {
      await realFs.rm(testDirs.paths.homeDir, { recursive: true, force: true });
    };

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    resolvedFs = new ResolvedFileSystem(realFs, testDirs.paths.homeDir);

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem: realFs,
      logger,
      systemInfo,
      env: {},
    });

    await realFs.mkdir(mockProjectConfig.paths.toolConfigsDir, { recursive: true });
  }

  afterEach(async () => {
    await cleanupFn();
  });

  it("should ignore runtime alias mirror directories during recursive tool discovery", async () => {
    await setupTest();

    const toolDir = path.join(mockProjectConfig.paths.toolConfigsDir, "valid-tool");
    const runtimeAliasDir = path.join(toolDir, ".dotfiles-runtime-imports-deadbeef");
    const runtimeAliasToolPath = path.join(runtimeAliasDir, "invalid-tool.tool.ts");
    const toolFilePath = path.join(toolDir, "valid-tool.tool.ts");

    await realFs.mkdir(runtimeAliasDir, { recursive: true });
    await realFs.writeFile(
      toolFilePath,
      dedentString(`
        export default (install) =>
          install('manual', { binaryPath: '/usr/bin/valid-tool' }).bin('valid-tool');
      `),
    );
    await realFs.writeFile(
      runtimeAliasToolPath,
      dedentString(`
        export default {};
      `),
    );

    const result = await loadToolConfigs(
      logger,
      mockProjectConfig.paths.toolConfigsDir,
      resolvedFs,
      mockProjectConfig,
      systemInfo,
    );
    const errorLogs = logger.logs.filter((log) => log["_meta"]?.logLevelName === "ERROR");

    expect(Object.keys(result)).toEqual(["valid-tool"]);
    expect(errorLogs).toHaveLength(0);
  });
});
