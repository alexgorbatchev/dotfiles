import { Architecture, type ISystemInfo, Platform } from "@dotfiles/core";
import { NodeFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createTestDirectories } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import { loadConfig } from "../loadConfig";

type CleanupFn = () => Promise<void>;

describe("loadConfig - TypeScript path substitution", () => {
  const mockSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: "/Users/testuser",
    hostname: "test-host",
  };

  let logger: TestLogger;
  let tempDir: string | undefined;
  let cleanupFn: CleanupFn | undefined;
  let realFs: NodeFileSystem;

  beforeEach(async () => {
    logger = new TestLogger();
    realFs = new NodeFileSystem();
  });

  afterEach(async () => {
    await cleanupFn?.();
    cleanupFn = undefined;
    tempDir = undefined;
  });

  it("should resolve targetDir path variable referencing paths.generatedDir", async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: "loadConfig-targetDir-path-var",
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      assert(tempDir);
      await realFs.rm(tempDir, { recursive: true, force: true });
    };

    assert(tempDir);

    const configPath = path.join(tempDir, "config.ts");
    const tsContent = `
      export default {
        paths: {
          generatedDir: '{configFileDir}/.generated',
          homeDir: '{paths.generatedDir}/user-home',
          targetDir: '{paths.generatedDir}/user-bin',
          toolConfigsDir: '{configFileDir}/tools',
        },
      };
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);
    const expectedGeneratedDir = path.join(expectedConfigDir, ".generated");
    const expectedTargetDir = path.join(expectedGeneratedDir, "user-bin");

    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
    expect(result.paths.targetDir).toBe(expectedTargetDir);
    expect(result.paths.homeDir).toBe(path.join(expectedGeneratedDir, "user-home"));
    expect(result.paths.toolConfigsDir).toBe(path.join(expectedConfigDir, "tools"));
  });

  it("should resolve nested path variable references in correct order", async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: "loadConfig-nested-path-vars",
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      assert(tempDir);
      await realFs.rm(tempDir, { recursive: true, force: true });
    };

    assert(tempDir);

    const configPath = path.join(tempDir, "config.ts");
    const tsContent = `
      export default {
        paths: {
          dotfilesDir: '{configFileDir}/dotfiles',
          generatedDir: '{paths.dotfilesDir}/.generated',
          targetDir: '{paths.generatedDir}/bin',
          shellScriptsDir: '{paths.generatedDir}/shell-scripts',
        },
      };
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);
    const expectedDotfilesDir = path.join(expectedConfigDir, "dotfiles");
    const expectedGeneratedDir = path.join(expectedDotfilesDir, ".generated");

    expect(result.paths.dotfilesDir).toBe(expectedDotfilesDir);
    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
    expect(result.paths.targetDir).toBe(path.join(expectedGeneratedDir, "bin"));
    expect(result.paths.shellScriptsDir).toBe(path.join(expectedGeneratedDir, "shell-scripts"));
  });

  it("should handle defineConfig wrapper with path variable substitution", async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: "loadConfig-defineConfig-wrapper",
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      assert(tempDir);
      await realFs.rm(tempDir, { recursive: true, force: true });
    };

    assert(tempDir);

    const configPath = path.join(tempDir, "config.ts");
    // This mimics test-project-npm/dotfiles.config.ts structure
    const tsContent = `
      import { defineConfig } from '@dotfiles/config';
      
      export default defineConfig(() => ({
        paths: {
          generatedDir: '{configFileDir}/.generated',
          homeDir: '{paths.generatedDir}/user-home',
          targetDir: '{paths.generatedDir}/user-bin',
          toolConfigsDir: '{configFileDir}/tools',
        },
      }));
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);
    const expectedGeneratedDir = path.join(expectedConfigDir, ".generated");
    const expectedTargetDir = path.join(expectedGeneratedDir, "user-bin");

    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
    expect(result.paths.targetDir).toBe(expectedTargetDir);
    expect(result.paths.homeDir).toBe(path.join(expectedGeneratedDir, "user-home"));
    expect(result.paths.toolConfigsDir).toBe(path.join(expectedConfigDir, "tools"));
  });

  it("should resolve relative paths against the config file directory", async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: "loadConfig-relative-paths",
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      assert(tempDir);
      await realFs.rm(tempDir, { recursive: true, force: true });
    };

    assert(tempDir);

    const configPath = path.join(tempDir, "config.ts");
    const tsContent = `
      export default {
        paths: {
          dotfilesDir: '.',
          generatedDir: '.generated',
          homeDir: './user-home',
          targetDir: './user-bin',
          toolConfigsDir: './tools',
          shellScriptsDir: './shell-scripts',
          binariesDir: './binaries',
        },
      };
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);

    expect(result.paths.dotfilesDir).toBe(expectedConfigDir);
    expect(result.paths.generatedDir).toBe(path.join(expectedConfigDir, ".generated"));
    expect(result.paths.homeDir).toBe(path.join(expectedConfigDir, "user-home"));
    expect(result.paths.targetDir).toBe(path.join(expectedConfigDir, "user-bin"));
    expect(result.paths.toolConfigsDir).toBe(path.join(expectedConfigDir, "tools"));
    expect(result.paths.shellScriptsDir).toBe(path.join(expectedConfigDir, "shell-scripts"));
    expect(result.paths.binariesDir).toBe(path.join(expectedConfigDir, "binaries"));
  });
});
