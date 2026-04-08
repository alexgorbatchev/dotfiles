import { createShell, type IAfterInstallContext, type ToolConfig } from "@dotfiles/core";
import { createMemFileSystem, type IMemFileSystemReturn, NodeFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createTestDirectories, type ITestDirectories } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { createConfiguredShell } from "../utils/createConfiguredShell";
import { HookExecutor, type HookHandler } from "../utils/HookExecutor";
import { createTestInstallHookContext } from "./hookContextTestHelper";

describe("HookExecutor $ Integration", () => {
  let logger: TestLogger;
  let hookExecutor: HookExecutor;
  let memFs: IMemFileSystemReturn;
  let nodeFs: NodeFileSystem;
  let testDirs: ITestDirectories;
  let toolConfigPath: string;

  beforeEach(async () => {
    logger = new TestLogger();
    hookExecutor = new HookExecutor((): void => {});
    memFs = await createMemFileSystem();
    nodeFs = new NodeFileSystem();

    // Create a temporary directory for integration tests
    testDirs = await createTestDirectories(logger, nodeFs, {
      testName: "hook-executor-dollar-integration",
    });
    toolConfigPath = path.join(testDirs.paths.homeDir, "test-tool.tool.ts");

    // Create a dummy tool config file
    await nodeFs.writeFile(toolConfigPath, 'export default async (c) => { c.bin("test-tool"); };');
  });

  afterEach(async () => {
    // Clean up temp directory
    await nodeFs.rm(testDirs.paths.homeDir, { recursive: true, force: true });
  });

  it("should execute shell commands with correct working directory", async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: "test-tool",
      binaries: ["test-tool"],
      version: "latest",
      installationMethod: "manual",
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    const contextWithToolConfig: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: baseContext.stagingDir,
      binaryPaths: [],
    };

    let actualCwd: string | undefined;

    const hookThatUsesShell: HookHandler = async (ctx) => {
      // Hooks run with the tool config directory as the default cwd.
      const result = await ctx.$`pwd`.quiet();
      actualCwd = result.stdout.toString().trim();

      // Verify we can access files relative to the tool config directory
      const configExists = await ctx.$`test -f ./test-tool.tool.ts && echo "exists" || echo "missing"`.quiet();
      expect(configExists.stdout.toString().trim()).toBe("exists");
    };

    const enhancedContext = hookExecutor.createEnhancedContext(contextWithToolConfig, memFs.fs);

    await hookExecutor.executeHook(logger, "afterInstall", hookThatUsesShell, enhancedContext);

    // Verify the working directory was set to the tool config directory
    // Use realpathSync to resolve symlinks for proper comparison on macOS
    expect(realpathSync(actualCwd || "")).toBe(realpathSync(testDirs.paths.homeDir));
  });

  it("should create files relative to tool config directory", async () => {
    const mockToolConfig: ToolConfig = {
      configFilePath: toolConfigPath,
      name: "file-creator-tool",
      binaries: ["file-creator-tool"],
      version: "latest",
      installationMethod: "manual",
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      toolName: "file-creator-tool",
      stagingDir: "/test/staging/dir",
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    const contextWithToolConfig: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfig,
      installedDir: baseContext.stagingDir,
      binaryPaths: [],
    };

    const hookThatCreatesFile: HookHandler = async (ctx) => {
      // Create a file relative to the tool config directory using $
      await ctx.$`echo "test content" > ./created-by-hook.txt`.quiet();

      // Verify the file was created
      const result = await ctx.$`cat ./created-by-hook.txt`.quiet();
      expect(result.stdout.toString().trim()).toBe("test content");
    };

    const enhancedContext = hookExecutor.createEnhancedContext(contextWithToolConfig, memFs.fs);

    await hookExecutor.executeHook(logger, "afterInstall", hookThatCreatesFile, enhancedContext);

    // Verify the file exists in the expected location
    const createdFilePath = path.join(testDirs.paths.homeDir, "created-by-hook.txt");
    expect(existsSync(createdFilePath)).toBe(true);
  });

  it("should handle fallback $ when configFilePath is missing", async () => {
    const mockToolConfigWithoutPath: ToolConfig = {
      // No configFilePath property
      name: "fallback-tool",
      binaries: ["fallback-tool"],
      version: "latest",
      installationMethod: "manual",
      installParams: {},
    };

    const { context: baseContext } = createTestInstallHookContext({
      toolName: "fallback-tool",
      stagingDir: "/test/staging/dir",
      $: createConfiguredShell(createShell({ logger }), process.env),
    });

    const contextWithoutConfigPath: IAfterInstallContext = {
      ...baseContext,
      toolConfig: mockToolConfigWithoutPath,
      installedDir: baseContext.stagingDir,
      binaryPaths: [],
    };

    const hookThatUsesShellFallback: HookHandler = async (ctx) => {
      // Should still be able to use $ even without configFilePath
      const result = await ctx.$`echo "fallback works"`.quiet();
      expect(result.stdout.toString()).toContain("fallback works");
    };

    const enhancedContext = hookExecutor.createEnhancedContext(contextWithoutConfigPath, memFs.fs);

    const hookResult = await hookExecutor.executeHook(
      logger,
      "afterInstall",
      hookThatUsesShellFallback,
      enhancedContext,
    );
    expect(hookResult.success).toBe(true);
  });
});
