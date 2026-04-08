import { createShell, type IAfterInstallContext, type ToolConfig } from "@dotfiles/core";
import { type IFileSystem, NodeFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createTestDirectories, type ITestDirectories } from "@dotfiles/testing-helpers";
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { createConfiguredShell } from "../utils/createConfiguredShell";
import { HookExecutor, type HookHandler } from "../utils/HookExecutor";
import { createTestInstallHookContext } from "./hookContextTestHelper";

describe("HookExecutor PATH Enhancement for after-install", () => {
  let logger: TestLogger;
  let hookExecutor: HookExecutor;
  let testDirs: ITestDirectories;
  let nodeFs: IFileSystem;
  let toolConfigPath: string;
  let binaryDir: string;
  let $: ReturnType<typeof createShell>;

  beforeAll(async () => {
    nodeFs = new NodeFileSystem();
    testDirs = await createTestDirectories(new TestLogger(), nodeFs, { testName: "hook-executor-path-enhancement" });
  });

  beforeEach(async () => {
    logger = new TestLogger();
    hookExecutor = new HookExecutor((): void => {});
    $ = createShell();

    toolConfigPath = path.join(testDirs.paths.homeDir, "test-tool.tool.ts");

    // Create a dummy tool config file
    await nodeFs.writeFile(toolConfigPath, 'export default async (c) => { c.bin("test-tool"); };');

    // Create a binary directory with a test executable
    binaryDir = path.join(testDirs.paths.homeDir, "bin");
    await nodeFs.ensureDir(binaryDir);

    // Create a simple test executable script
    const testBinaryPath = path.join(binaryDir, "test-tool");
    await nodeFs.writeFile(testBinaryPath, '#!/bin/bash\necho "test-tool-executed"');
    await $`chmod +x ${testBinaryPath}`.quiet();
  });

  it("should include binary directories in PATH for after-install hooks", async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: "test-tool",
      binaries: ["test-tool"],
      version: "1.0.0",
      installationMethod: "github-release",
      installParams: {
        repo: "test/test-repo",
      },
    };

    const testBinaryPath = path.join(binaryDir, "test-tool");

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    const afterInstallContext: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: testDirs.paths.homeDir,
      binaryPaths: [testBinaryPath],
      version: "1.0.0",
    };

    let pathFromShell: string | undefined;
    let toolOutput: string | undefined;

    const hookThatUsesInstalledBinary: HookHandler<IAfterInstallContext> = async (ctx) => {
      // Check what PATH the shell has access to
      const pathResult = await ctx.$`printenv PATH`.quiet();
      pathFromShell = pathResult.stdout.toString().trim();

      // Execute the binary directly by name - bun shell should find it via enhanced PATH
      const toolResult = await ctx.$`test-tool`.quiet();
      toolOutput = toolResult.stdout.toString().trim();
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, nodeFs);

    await hookExecutor.executeHook(logger, "after-install", hookThatUsesInstalledBinary, enhancedContext);

    // Verify the binary directory is in PATH
    expect(pathFromShell).toContain(binaryDir);

    // Verify the binary was executed successfully
    expect(toolOutput).toBe("test-tool-executed");
  });

  it("should include multiple binary directories in PATH when binaryPaths span different directories", async () => {
    // Create a second binary directory
    const binaryDir2 = path.join(testDirs.paths.homeDir, "lib", "bin");
    await nodeFs.ensureDir(binaryDir2);

    // Create a second test executable
    const testBinary2Path = path.join(binaryDir2, "test-tool-2");
    await nodeFs.writeFile(testBinary2Path, '#!/bin/bash\necho "test-tool-2-executed"');
    await $`chmod +x ${testBinary2Path}`.quiet();

    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: "multi-bin-tool",
      binaries: ["test-tool", "test-tool-2"],
      version: "1.0.0",
      installationMethod: "github-release",
      installParams: {
        repo: "test/test-repo",
      },
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    const afterInstallContext: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: testDirs.paths.homeDir,
      binaryPaths: [path.join(binaryDir, "test-tool"), testBinary2Path],
      version: "1.0.0",
    };

    let pathFromShell: string | undefined;

    const hookThatChecksPath: HookHandler<IAfterInstallContext> = async (ctx) => {
      const pathResult = await ctx.$`printenv PATH`.quiet();
      pathFromShell = pathResult.stdout.toString().trim();

      // Both binaries should be executable directly by name
      const tool1Result = await ctx.$`test-tool`.quiet();
      expect(tool1Result.stdout.toString().trim()).toBe("test-tool-executed");

      const tool2Result = await ctx.$`test-tool-2`.quiet();
      expect(tool2Result.stdout.toString().trim()).toBe("test-tool-2-executed");
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, nodeFs);

    await hookExecutor.executeHook(logger, "after-install", hookThatChecksPath, enhancedContext);

    // Verify both binary directories are in PATH
    expect(pathFromShell).toContain(binaryDir);
    expect(pathFromShell).toContain(binaryDir2);
  });

  it("should handle empty binaryPaths gracefully", async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: "no-bin-tool",
      binaries: [],
      version: "1.0.0",
      installationMethod: "brew",
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    const afterInstallContext: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: testDirs.paths.homeDir,
      binaryPaths: [],
      version: "1.0.0",
    };

    const hookThatEchos: HookHandler<IAfterInstallContext> = async (ctx) => {
      // Should still be able to use shell even without binary paths
      const result = await ctx.$`echo "works"`.quiet();
      expect(result.stdout.toString().trim()).toBe("works");
    };

    const enhancedContext = hookExecutor.createEnhancedContext(afterInstallContext, nodeFs);

    const result = await hookExecutor.executeHook(logger, "after-install", hookThatEchos, enhancedContext);
    expect(result.success).toBe(true);
  });
});
