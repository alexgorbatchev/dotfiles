import type { ProjectConfig } from "@dotfiles/config";
import type { ISystemInfo, ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import { createMemFileSystem, type IMemFileSystemReturn } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from "@dotfiles/testing-helpers";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";
import { CopyGenerator } from "../CopyGenerator";
import type { IGenerateCopiesOptions } from "../ICopyGenerator";

describe("CopyGenerator", () => {
  let mockFs: IMemFileSystemReturn;
  let projectConfig: ProjectConfig;
  let copyGenerator: CopyGenerator;
  let logger: TestLogger;
  let systemInfo: ISystemInfo;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    mock.restore();
    logger = new TestLogger();
    mockFs = await createMemFileSystem();

    testDirs = await createTestDirectories(logger, mockFs.fs, { testName: "copy-generator" });

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    projectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem: mockFs.fs,
      logger,
      systemInfo,
      env: {},
    });

    copyGenerator = new CopyGenerator(logger, mockFs.fs, projectConfig, systemInfo);
  });

  const createToolConfig = (copies: Array<{ source: string; target: string }>): ToolConfig => ({
    name: "test-tool",
    binaries: ["test-tool"],
    version: "1.0.0",
    configFilePath: path.join(testDirs.paths.toolConfigsDir, "test-tool.tool.ts"),
    copies,
    installationMethod: "manual",
    installParams: {},
  });

  const getSourcePath = (relativePath: string): string => path.join(testDirs.paths.toolConfigsDir, relativePath);
  const getTargetPath = (relativePath: string): string => path.join(testDirs.paths.toolConfigsDir, relativePath);

  it("should copy a file successfully", async () => {
    const sourcePath = "src/file.txt";
    const targetPath = ".file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetFullPath = getTargetPath(targetPath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: targetPath }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "file content" });

    const results = await copyGenerator.generate(toolConfigs);

    expect(await mockFs.fs.exists(targetFullPath)).toBe(true);
    expect(await mockFs.fs.readFile(targetFullPath)).toBe("file content");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath: targetFullPath,
        status: "created",
      },
    ]);
  });

  it("should expand ~ in target path to home directory", async () => {
    const sourcePath = "src/another.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: "~/.another.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    const results = await copyGenerator.generate(toolConfigs);
    const targetPath = path.join(projectConfig.paths.homeDir, ".another.txt");

    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readFile(targetPath)).toBe("content");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "created",
      },
    ]);
  });

  it("should fail when source file does not exist", async () => {
    const sourcePath = "nonexistent.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".nonexistent.txt" }]),
    };

    const results = await copyGenerator.generate(toolConfigs);

    const targetPath = getTargetPath(".nonexistent.txt");
    expect(await mockFs.fs.exists(targetPath)).toBe(false);
    expect(results).toEqual([
      {
        success: false,
        sourcePath: sourceFullPath,
        targetPath,
        status: "failed",
        error: expect.stringContaining("source file not found"),
      },
    ]);
  });

  it("should skip if target exists and overwrite is false (default)", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: "source content",
      [targetPath]: "existing target content",
    });

    const results = await copyGenerator.generate(toolConfigs);

    expect(await mockFs.fs.readFile(targetPath)).toBe("existing target content");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "skipped_exists",
      },
    ]);
  });

  it("should overwrite if target exists and overwrite is true", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: "new source content",
      [targetPath]: "existing target content",
    });

    const options: IGenerateCopiesOptions = { overwrite: true };
    const results = await copyGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readFile(targetPath)).toBe("new source content");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "updated_target",
      },
    ]);
  });

  it("should backup and overwrite if overwrite and backup are true", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");
    const backupPath = `${targetPath}.bak`;

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: "new source content",
      [targetPath]: "existing target content",
    });

    const options: IGenerateCopiesOptions = { overwrite: true, backup: true };
    const results = await copyGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.exists(backupPath)).toBe(true);
    expect(await mockFs.fs.readFile(backupPath)).toBe("existing target content");
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readFile(targetPath)).toBe("new source content");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "backed_up",
      },
    ]);
  });

  it("should copy a directory recursively", async () => {
    const sourceDirPath = "src/config";
    const targetDirPath = ".config/tool";
    const sourceDirFullPath = getSourcePath(sourceDirPath);
    const targetDirFullPath = getTargetPath(targetDirPath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourceDirPath, target: targetDirPath }]),
    };

    await mockFs.addFiles({
      [path.join(sourceDirFullPath, "file1.txt")]: "content1",
      [path.join(sourceDirFullPath, "subdir", "file2.txt")]: "content2",
    });

    const results = await copyGenerator.generate(toolConfigs);

    expect(await mockFs.fs.exists(path.join(targetDirFullPath, "file1.txt"))).toBe(true);
    expect(await mockFs.fs.readFile(path.join(targetDirFullPath, "file1.txt"))).toBe("content1");
    expect(await mockFs.fs.exists(path.join(targetDirFullPath, "subdir", "file2.txt"))).toBe(true);
    expect(await mockFs.fs.readFile(path.join(targetDirFullPath, "subdir", "file2.txt"))).toBe("content2");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceDirFullPath,
        targetPath: targetDirFullPath,
        status: "created",
      },
    ]);
  });

  it("should return empty array if toolConfigs is empty", async () => {
    const results = await copyGenerator.generate({});
    expect(results).toEqual([]);
  });

  it("should return empty array if a toolConfig has no copies array", async () => {
    const toolConfigs = {
      tool1: {
        name: "test",
        binaries: [],
        version: "1.0.0",
        copies: undefined,
        installationMethod: "manual",
        installParams: {},
      },
    };
    const results = await copyGenerator.generate(toolConfigs as Record<string, ToolConfig>);
    expect(results).toEqual([]);
  });

  it("should return empty array if a toolConfig has an empty copies array", async () => {
    const toolConfigs = {
      tool1: createToolConfig([]),
    };
    const results = await copyGenerator.generate(toolConfigs);
    expect(results).toEqual([]);
  });

  it("should ensure target directory is created", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: "newdir/.file.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    const results = await copyGenerator.generate(toolConfigs);

    const targetPath = getTargetPath("newdir/.file.txt");
    const targetDir = path.dirname(targetPath);

    expect(await mockFs.fs.exists(targetDir)).toBe(true);
    expect((await mockFs.fs.stat(targetDir)).isDirectory()).toBe(true);
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readFile(targetPath)).toBe("content");
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "created",
      },
    ]);
  });

  it("should return failed status if copy operation fails", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".file.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    mockFs.spies.copyFile.mockImplementationOnce(() => {
      throw new Error("Copy failed");
    });

    const results = await copyGenerator.generate(toolConfigs);

    expect(results).toEqual([
      {
        success: false,
        sourcePath: sourceFullPath,
        targetPath: getTargetPath(".file.txt"),
        status: "failed",
        error: expect.stringContaining("Failed to copy"),
      },
    ]);
  });

  describe("platform-specific copies", () => {
    it("should resolve copies defined in platformConfigs for matching platform", async () => {
      const sourcePath = "src/config.toml";
      const targetPath = "~/.config/tool/config.toml";
      const sourceFullPath = getSourcePath(sourcePath);
      const targetFullPath = path.join(projectConfig.paths.homeDir, ".config/tool/config.toml");

      const toolConfigWithPlatformCopies: ToolConfig = {
        name: "platform-tool",
        binaries: ["platform-tool"],
        version: "1.0.0",
        configFilePath: path.join(testDirs.paths.toolConfigsDir, "platform-tool.tool.ts"),
        installationMethod: "brew",
        installParams: { formula: "platform-tool" },
        platformConfigs: [
          {
            platforms: Platform.Linux,
            config: {
              copies: [{ source: sourcePath, target: targetPath }],
            },
          },
        ],
      };

      await mockFs.addFiles({ [sourceFullPath]: "config content" });

      const results = await copyGenerator.generate({ "platform-tool": toolConfigWithPlatformCopies });

      expect(await mockFs.fs.exists(targetFullPath)).toBe(true);
      expect(await mockFs.fs.readFile(targetFullPath)).toBe("config content");
      expect(results).toEqual([
        {
          success: true,
          sourcePath: sourceFullPath,
          targetPath: targetFullPath,
          status: "created",
        },
      ]);
    });

    it("should not process copies from platformConfigs for non-matching platform", async () => {
      const sourcePath = "src/config.toml";
      const targetPath = "~/.config/tool/config.toml";
      const sourceFullPath = getSourcePath(sourcePath);
      const targetFullPath = path.join(projectConfig.paths.homeDir, ".config/tool/config.toml");

      const toolConfigWithPlatformCopies: ToolConfig = {
        name: "macos-only-tool",
        binaries: ["macos-tool"],
        version: "1.0.0",
        configFilePath: path.join(testDirs.paths.toolConfigsDir, "macos-tool.tool.ts"),
        installationMethod: "brew",
        installParams: { formula: "macos-tool", cask: true },
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            config: {
              copies: [{ source: sourcePath, target: targetPath }],
            },
          },
        ],
      };

      await mockFs.addFiles({ [sourceFullPath]: "config content" });

      const results = await copyGenerator.generate({ "macos-only-tool": toolConfigWithPlatformCopies });

      expect(await mockFs.fs.exists(targetFullPath)).toBe(false);
      expect(results).toEqual([]);
    });
  });
});
