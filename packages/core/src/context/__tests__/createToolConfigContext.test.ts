import type { ProjectConfig } from "@dotfiles/config";
import type { IResolvedFileSystem, MockedFileSystem } from "@dotfiles/file-system";
import { createMemFileSystem } from "@dotfiles/file-system";
import { LogLevel, TestLogger } from "@dotfiles/logger";
import { createMockProjectConfig } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { Architecture, Libc, type ISystemInfo, Platform } from "../../common";
import { createToolConfigContext, ResolveError } from "../createToolConfigContext";

describe("createToolConfigContext", () => {
  let projectConfig: ProjectConfig;
  let fileSystem: MockedFileSystem;
  let resolvedFs: IResolvedFileSystem;
  let logger: TestLogger;

  const systemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: "/Users/testuser",
    libc: Libc.Gnu,
    hostname: "test-host",
  };

  beforeEach(async () => {
    logger = new TestLogger({ minLevel: LogLevel.VERBOSE });
    const memFs = await createMemFileSystem();
    fileSystem = memFs.fs;
    resolvedFs = memFs.fs.asIResolvedFileSystem;
    await fileSystem.ensureDir("/test");

    projectConfig = await createMockProjectConfig({
      config: {
        paths: {
          homeDir: "/Users/testuser",
          dotfilesDir: "/Users/testuser/.dotfiles",
          generatedDir: "/Users/testuser/.dotfiles/.generated",
          targetDir: "/Users/testuser/.dotfiles/.generated/usr-local-bin",
          binariesDir: "/Users/testuser/.dotfiles/.generated/binaries",
          toolConfigsDir: "/Users/testuser/.dotfiles/configs/tools",
        },
      },
      filePath: "/test/config.ts",
      fileSystem,
      logger,
      systemInfo,
      env: {},
    });
  });

  it("should expose currentDir and not expose legacy install directory key", () => {
    const toolName = "test-tool";
    const toolDir = "/tmp/tools/test-tool";

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    const currentDirParsed = z.object({ currentDir: z.string() }).safeParse(context);
    expect(currentDirParsed.success).toBe(true);
    assert(currentDirParsed.success);

    const expectedCurrentDir = path.join(projectConfig.paths.binariesDir, toolName, "current");
    expect(currentDirParsed.data.currentDir).toBe(expectedCurrentDir);

    const legacyKey = "installDir";
    const legacyShape: Record<string, z.ZodString> = { [legacyKey]: z.string() };
    const legacyParsed = z.object(legacyShape).safeParse(context);
    expect(legacyParsed.success).toBe(false);
  });

  it("should preserve libc information in the tool config context", () => {
    const toolName = "test-tool";
    const toolDir = "/tmp/tools/test-tool";

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    expect(context.systemInfo.libc).toBe(Libc.Gnu);
  });

  it("should expose replaceInFile function that uses injected fileSystem", async () => {
    const toolName = "test-tool";
    const toolDir = "/tmp/tools/test-tool";

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    expect(typeof context.replaceInFile).toBe("function");

    // Create a test file
    await fileSystem.ensureDir("/test/files");
    await fileSystem.writeFile("/test/files/config.txt", "version=1\nname=test", "utf8");

    // Use the context's replaceInFile with positional params
    await context.replaceInFile("/test/files/config.txt", /version=(\d+)/, "version=2");

    const content = await fileSystem.readFile("/test/files/config.txt", "utf8");
    expect(content).toBe("version=2\nname=test");
  });

  it("should return true when replaceInFile makes replacements", async () => {
    const toolName = "test-tool";
    const toolDir = "/tmp/tools/test-tool";

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir("/test/files");
    await fileSystem.writeFile("/test/files/config.txt", "foo bar foo", "utf8");

    const wasReplaced: boolean = await context.replaceInFile("/test/files/config.txt", /foo/, "baz");

    expect(wasReplaced).toBe(true);
  });

  it("should return false when replaceInFile finds no matches", async () => {
    const toolName = "test-tool";
    const toolDir = "/tmp/tools/test-tool";

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

    await fileSystem.ensureDir("/test/files");
    await fileSystem.writeFile("/test/files/config.txt", "hello world", "utf8");

    const wasReplaced: boolean = await context.replaceInFile("/test/files/config.txt", /does-not-exist/, "replacement");

    expect(wasReplaced).toBe(false);
  });

  it("should log error with pattern and file when errorMessage provided and no matches found", async () => {
    const toolName = "my-test-tool";
    const toolDir = "/tmp/tools/test-tool";
    const testLogger = new TestLogger({ minLevel: LogLevel.VERBOSE });

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, testLogger);

    await fileSystem.ensureDir("/test/files");
    await fileSystem.writeFile("/test/files/config.txt", "hello world", "utf8");

    await context.replaceInFile("/test/files/config.txt", /does-not-exist/, "replacement", {
      errorMessage: "Could not find pattern in config file",
    });

    testLogger.expect(["ERROR"], [], [], ["Could not find 'does-not-exist' in /test/files/config.txt"]);
  });

  it("should not log error when errorMessage provided but matches found", async () => {
    const toolName = "my-test-tool";
    const toolDir = "/tmp/tools/test-tool";
    const testLogger = new TestLogger({ minLevel: LogLevel.VERBOSE });

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, testLogger);

    await fileSystem.ensureDir("/test/files");
    await fileSystem.writeFile("/test/files/config.txt", "foo bar foo", "utf8");

    await context.replaceInFile("/test/files/config.txt", /foo/, "baz", {
      errorMessage: "Could not find pattern",
    });

    // No error should be logged since matches were found
    expect(testLogger.logs.length).toBe(0);
  });

  it("should not log error when no errorMessage provided even if no matches", async () => {
    const toolName = "my-test-tool";
    const toolDir = "/tmp/tools/test-tool";
    const testLogger = new TestLogger({ minLevel: LogLevel.VERBOSE });

    const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, testLogger);

    await fileSystem.ensureDir("/test/files");
    await fileSystem.writeFile("/test/files/config.txt", "hello world", "utf8");

    await context.replaceInFile("/test/files/config.txt", /does-not-exist/, "replacement");

    // No error should be logged since errorMessage wasn't provided
    expect(testLogger.logs.length).toBe(0);
  });

  describe("log property", () => {
    it("should expose log property with info, warn, error, debug, trace methods", () => {
      const toolName = "test-tool";
      const toolDir = "/tmp/tools/test-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      expect(context.log).toBeDefined();
      expect(typeof context.log.info).toBe("function");
      expect(typeof context.log.warn).toBe("function");
      expect(typeof context.log.error).toBe("function");
      expect(typeof context.log.debug).toBe("function");
      expect(typeof context.log.trace).toBe("function");
    });

    it("should log info message with toolName context prefix", () => {
      const toolName = "my-tool";
      const toolDir = "/tmp/tools/my-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.info("Installing dependencies");

      logger.expect(["INFO"], [], ["my-tool"], ["Installing dependencies"]);
    });

    it("should log warn message with toolName context prefix", () => {
      const toolName = "my-tool";
      const toolDir = "/tmp/tools/my-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.warn("Configuration file missing, using defaults");

      logger.expect(["WARN"], [], ["my-tool"], ["Configuration file missing, using defaults"]);
    });

    it("should log error message with toolName context prefix", () => {
      const toolName = "my-tool";
      const toolDir = "/tmp/tools/my-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.error("Failed to download asset");

      logger.expect(["ERROR"], [], ["my-tool"], ["Failed to download asset"]);
    });

    it("should log error message with error object", () => {
      const toolName = "my-tool";
      const toolDir = "/tmp/tools/my-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);
      const testError = new Error("Network timeout");

      context.log.error("Download failed", testError);

      // Should log the message with context and include the error
      logger.expect(["ERROR"], [], ["my-tool"], ["Download failed"]);
    });

    it("should log debug message with toolName context prefix", () => {
      const toolName = "my-tool";
      const toolDir = "/tmp/tools/my-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.debug("Extracting archive to staging directory");

      logger.expect(["DEBUG"], [], ["my-tool"], ["Extracting archive to staging directory"]);
    });

    it("should log trace message with toolName context prefix", () => {
      const toolName = "my-tool";
      const toolDir = "/tmp/tools/my-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, resolvedFs, logger);

      context.log.trace("Processing file: config.ts");

      logger.expect(["TRACE"], [], ["my-tool"], ["Processing file: config.ts"]);
    });
  });

  describe("resolve property", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resolve-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("should expose resolve function", () => {
      const toolName = "test-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      expect(context.resolve).toBeDefined();
      expect(typeof context.resolve).toBe("function");
    });

    it("should return the path when exactly one match is found (relative pattern)", async () => {
      const toolName = "test-tool";
      const configDir = path.join(tempDir, "config");

      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, "settings.yaml"), "key: value", "utf8");

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      const result = context.resolve("config/settings.yaml");

      expect(result).toBe(path.join(tempDir, "config/settings.yaml"));
    });

    it("should resolve glob patterns with wildcards", async () => {
      const toolName = "test-tool";
      const versionDir = path.join(tempDir, "ripgrep-14.1.0-x86_64-linux");

      await fs.mkdir(versionDir, { recursive: true });

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      const result = context.resolve("ripgrep-*-x86_64-linux");

      expect(result).toBe(versionDir);
    });

    it("should resolve absolute paths", async () => {
      const toolName = "test-tool";
      const binDir = path.join(tempDir, "bin");

      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, "myapp"), "#!/bin/bash", "utf8");

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      const result = context.resolve(path.join(tempDir, "bin/myapp"));

      expect(result).toBe(path.join(binDir, "myapp"));
    });

    it("should throw ResolveError when no matches are found", async () => {
      const toolName = "test-tool";

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      expect(() => context.resolve("non-existent-*")).toThrow(ResolveError);
      expect(() => context.resolve("non-existent-*")).toThrow("No matches found");
    });

    it("should log ERROR when no matches are found", async () => {
      const toolName = "test-tool";
      const testLogger = new TestLogger({ minLevel: LogLevel.VERBOSE });

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, testLogger);

      try {
        context.resolve("missing-pattern-*");
      } catch {
        // Expected
      }

      testLogger.expect(["ERROR"], [], [], ["No matches found for pattern: missing-pattern-*"]);
    });

    it("should throw ResolveError when multiple matches are found", async () => {
      const toolName = "test-tool";

      await fs.writeFile(path.join(tempDir, "config-a.yaml"), "a", "utf8");
      await fs.writeFile(path.join(tempDir, "config-b.yaml"), "b", "utf8");

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      expect(() => context.resolve("config-*.yaml")).toThrow(ResolveError);
      expect(() => context.resolve("config-*.yaml")).toThrow("matched 2 paths");
    });

    it("should log ERROR with match list when multiple matches are found", async () => {
      const toolName = "test-tool";
      const testLogger = new TestLogger({ minLevel: LogLevel.VERBOSE });

      await fs.writeFile(path.join(tempDir, "file-1.txt"), "1", "utf8");
      await fs.writeFile(path.join(tempDir, "file-2.txt"), "2", "utf8");

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, testLogger);

      try {
        context.resolve("file-*.txt");
      } catch {
        // Expected
      }

      testLogger.expect(["ERROR"], [], [], ["Pattern 'file-*.txt' matched 2 paths"]);
    });

    it("should resolve directories as well as files", async () => {
      const toolName = "test-tool";
      const themesDir = path.join(tempDir, "share/themes");

      await fs.mkdir(themesDir, { recursive: true });

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      const result = context.resolve("share/themes");

      expect(result).toBe(themesDir);
    });

    it("should resolve nested glob patterns", async () => {
      const toolName = "test-tool";
      const completionsDir = path.join(tempDir, "completions");

      await fs.mkdir(completionsDir, { recursive: true });
      await fs.writeFile(path.join(completionsDir, "_mytool.zsh"), "# completion", "utf8");

      const context = createToolConfigContext(projectConfig, systemInfo, toolName, tempDir, resolvedFs, logger);

      const result = context.resolve("completions/*.zsh");

      expect(result).toBe(path.join(completionsDir, "_mytool.zsh"));
    });
  });
});
