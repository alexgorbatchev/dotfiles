import type { ProjectConfig } from "@dotfiles/config";
import type { ISystemInfo, IToolPathMapping, ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import { createMemFileSystem, type IMemFileSystemReturn, ResolvedFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { RegistryDatabase } from "@dotfiles/registry-database";
import { FileRegistry, TrackedFileSystem } from "@dotfiles/registry/file";
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { IGenerateSymlinksOptions } from "../ISymlinkGenerator";
import { SymlinkGenerator } from "../SymlinkGenerator";

describe("SymlinkGenerator", () => {
  let mockFs: IMemFileSystemReturn;
  let projectConfig: ProjectConfig;
  let symlinkGenerator: SymlinkGenerator;
  let logger: TestLogger;
  let systemInfo: ISystemInfo;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    mock.restore();
    logger = new TestLogger();
    mockFs = await createMemFileSystem();

    testDirs = await createTestDirectories(logger, mockFs.fs, { testName: "symlink-generator" });

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

    symlinkGenerator = new SymlinkGenerator(logger, mockFs.fs, projectConfig, systemInfo);
  });

  const createToolConfig = (symlinks: IToolPathMapping[]): ToolConfig => ({
    name: "test-tool",
    binaries: ["test-tool"],
    version: "1.0.0",
    configFilePath: path.join(testDirs.paths.toolConfigsDir, "test-tool.tool.ts"),
    symlinks,
    installationMethod: "manual",
    installParams: {},
  });

  // Helper function to get the absolute path where source files should be created (relative to config file)
  const getSourcePath = (relativePath: string) => path.join(testDirs.paths.toolConfigsDir, relativePath);

  // Helper function to get the absolute path where target symlinks will be created (relative to config file)
  const getTargetPath = (relativePath: string) => path.join(testDirs.paths.toolConfigsDir, relativePath);

  it("should create a symlink successfully", async () => {
    const sourcePath = "src/file.txt";
    const targetPath = ".file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetFullPath = getTargetPath(targetPath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: targetPath }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    const results = await symlinkGenerator.generate(toolConfigs);
    expect(await mockFs.fs.exists(targetFullPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetFullPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,

        targetPath: targetFullPath,
        status: "created",
      },
    ]);

    // Verify logger received symlink creation message
    logger.expect(["DEBUG"], ["SymlinkGenerator", "generate", "processSymlink"], [], ["Processing symlink"]);
  });

  it("should expand ~ in target path to home directory and return result", async () => {
    const sourcePath = "src/another.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: "~/.another.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    const results = await symlinkGenerator.generate(toolConfigs);
    const targetPath = path.join(projectConfig.paths.homeDir, ".another.txt");

    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);

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

    const results = await symlinkGenerator.generate(toolConfigs);

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

    logger.expect(
      ["ERROR"],
      ["SymlinkGenerator", "generate", "processSymlink"],
      [],
      ['Tool "test-tool" source file not found'],
    );
  });

  it("should skip if target exists and overwrite is false (default), returning skipped_exists", async () => {
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

    const results = await symlinkGenerator.generate(toolConfigs);

    expect(await mockFs.fs.readFile(targetPath)).toBe("existing target content"); // Should not be overwritten
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "skipped_exists",
      },
    ]);
  });

  it("should overwrite if target exists and overwrite is true, returning updated_target", async () => {
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

    const options: IGenerateSymlinksOptions = { overwrite: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "updated_target", // Or 'created' if it considers the final link as new after delete
      },
    ]);
  });

  it("should backup and overwrite if target exists, overwrite is true, and backup is true, returning backed_up", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");
    const backupPath = `${targetPath}.bak`;

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: "source content",
      [targetPath]: "existing target content",
    });

    const options: IGenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.exists(backupPath)).toBe(true);
    expect(await mockFs.fs.readFile(backupPath)).toBe("existing target content");
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "backed_up",
      },
    ]);
  });

  it("should handle broken symlink at target path with overwrite and backup", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };

    // Create source file
    await mockFs.addFiles({ [sourceFullPath]: "source content" });

    // Create a broken symlink at the target path (points to non-existent file)
    await mockFs.fs.ensureDir(path.dirname(targetPath));
    await mockFs.fs.symlink("/non-existent-old-target", targetPath);

    // Verify it's a broken symlink (use lstat since exists() returns false for broken symlinks)
    const stats = await mockFs.fs.lstat(targetPath);
    expect(stats.isSymbolicLink()).toBe(true);
    expect(await mockFs.fs.exists(targetPath)).toBe(false); // Broken symlink - target doesn't exist

    const options: IGenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // Should successfully create the new symlink
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);

    // Broken symlinks are deleted, not backed up (no point backing up a broken symlink)
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "created",
      },
    ]);
  });

  it("should attempt symlink creation and return created status (simulating dry run with MemFS)", async () => {
    // SymlinkGenerator always attempts operations. MemFS simulates dry run by not hitting actual disk.
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "source content" });

    // No dryRun option passed
    const results = await symlinkGenerator.generate(toolConfigs, {});

    // MemFS will reflect the symlink creation
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "created",
      },
    ]);
  });

  it("should attempt backup/overwrite and return backed_up status (simulating dry run with MemFS)", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");
    const backupPath = `${targetPath}.bak`;

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: "source content",
      [targetPath]: "existing target content",
    });

    // No dryRun option passed
    const options: IGenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // MemFS will reflect backup and overwrite
    expect(await mockFs.fs.exists(backupPath)).toBe(true);
    expect(await mockFs.fs.readFile(backupPath)).toBe("existing target content");
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "backed_up",
      },
    ]);
  });

  it("should return empty array if toolConfigs is empty", async () => {
    const fsSpySymlink = spyOn(mockFs.fs, "symlink");
    const results = await symlinkGenerator.generate({});
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it("should return empty array if a toolConfig has no symlinks array", async () => {
    const fsSpySymlink = spyOn(mockFs.fs, "symlink");
    const toolConfigs = {
      tool1: {
        name: "test",
        binaries: [],
        version: "1.0.0",
        symlinks: undefined,
        installationMethod: "manual",
        installParams: {},
      },
    };
    const results = await symlinkGenerator.generate(toolConfigs as Record<string, ToolConfig>);
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it("should return empty array if a toolConfig has an empty symlinks array", async () => {
    const fsSpySymlink = spyOn(mockFs.fs, "symlink");
    const toolConfigs = {
      tool1: createToolConfig([]),
    };
    const results = await symlinkGenerator.generate(toolConfigs);
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it("should overwrite existing backup file if backup is true and return backed_up", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target.txt");
    const backupPath = `${targetPath}.bak`;

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target.txt" }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: "new source content",
      [targetPath]: "original target content",
      [backupPath]: "old backup content", // Pre-existing backup
    });

    const options: IGenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.readFile(backupPath)).toBe("original target content"); // New backup
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "backed_up",
      },
    ]);
  });

  it("should correctly overwrite an existing directory if target is a directory and overwrite is true, returning updated_target", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = getTargetPath(".target_dir_as_file");
    const fileInTargetDir = path.join(targetPath, "somefile.txt");

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".target_dir_as_file" }]),
    };

    // Setup source file and target directory
    await mockFs.addFiles({ [sourceFullPath]: "source content" });
    await mockFs.fs.mkdir(targetPath, { recursive: true });
    await mockFs.fs.writeFile(fileInTargetDir, "content in dir");

    const options: IGenerateSymlinksOptions = { overwrite: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // Directory should be removed and replaced by symlink
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect((await mockFs.fs.stat(targetPath)).isDirectory()).toBe(false); // No longer a directory
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "updated_target",
      },
    ]);
  });

  it("should ensure target directory is created and return created", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: "newdir/.file.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    const results = await symlinkGenerator.generate(toolConfigs);

    const targetPath = getTargetPath("newdir/.file.txt");
    const targetDir = path.dirname(targetPath);

    expect(await mockFs.fs.exists(targetDir)).toBe(true);
    expect((await mockFs.fs.stat(targetDir)).isDirectory()).toBe(true);
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,
        targetPath,
        status: "created",
      },
    ]);
  });

  it("should correctly resolve non-tilde prefixed relative target paths from homeDir and return created", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: "subdir/.configfile" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    const results = await symlinkGenerator.generate(toolConfigs);

    const expectedTargetPath = getTargetPath("subdir/.configfile");
    expect(await mockFs.fs.exists(expectedTargetPath)).toBe(true);
    expect(await mockFs.fs.readlink(expectedTargetPath)).toBe(sourceFullPath);
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,

        targetPath: expectedTargetPath,
        status: "created",
      },
    ]);
  });

  it("should skip if symlink already points to correct target", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);
    const targetPath = ".file.txt";
    const expectedTargetPath = getTargetPath(targetPath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: targetPath }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    // Pre-create the correct symlink
    await mockFs.fs.symlink(sourceFullPath, expectedTargetPath);

    const results = await symlinkGenerator.generate(toolConfigs, { overwrite: true });

    // Should not recreate the symlink - just skip with correct status
    expect(results).toEqual([
      {
        success: true,
        sourcePath: sourceFullPath,

        targetPath: expectedTargetPath,
        status: "skipped_correct",
      },
    ]);

    // Verify symlink still points to the correct target
    expect(await mockFs.fs.readlink(expectedTargetPath)).toBe(sourceFullPath);
  });

  it("should return failed status if symlink creation fails", async () => {
    const sourcePath = "src/file.txt";
    const sourceFullPath = getSourcePath(sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: ".file.txt" }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: "content" });

    mockFs.spies.symlink.mockImplementationOnce(() => {
      assert.fail("Symlink failed");
    });

    const results = await symlinkGenerator.generate(toolConfigs);

    expect(results).toEqual([
      {
        success: false,
        sourcePath: sourceFullPath,
        targetPath: getTargetPath(".file.txt"),
        status: "failed",
        error: expect.stringContaining("Failed to create symlink"),
      },
    ]);
  });

  describe("createBinarySymlink", () => {
    it("should create a symlink when source exists and target does not", async () => {
      const sourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create source binary
      await mockFs.fs.ensureDir(path.dirname(sourcePath));
      await mockFs.fs.writeFile(sourcePath, '#!/bin/bash\necho "tool"');
      await mockFs.fs.chmod(sourcePath, 0o755);

      // Create symlink
      await symlinkGenerator.createBinarySymlink(logger, sourcePath, targetPath);

      // Verify symlink was created
      const targetExists = await mockFs.fs.exists(targetPath);
      expect(targetExists).toBe(true);

      const stats = await mockFs.fs.lstat(targetPath);
      expect(stats.isSymbolicLink()).toBe(true);

      const linkTarget = await mockFs.fs.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      expect(resolvedTarget).toBe(path.resolve(sourcePath));
    });

    it("should skip creation if symlink already exists and is valid", async () => {
      const sourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create source binary
      await mockFs.fs.ensureDir(path.dirname(sourcePath));
      await mockFs.fs.writeFile(sourcePath, '#!/bin/bash\necho "tool"');
      await mockFs.fs.chmod(sourcePath, 0o755);

      // Create initial symlink
      await mockFs.fs.ensureDir(path.dirname(targetPath));
      await mockFs.fs.symlink(sourcePath, targetPath);

      // Call createBinarySymlink - should detect existing valid symlink
      await symlinkGenerator.createBinarySymlink(logger, sourcePath, targetPath);

      // Verify symlink still exists and wasn't recreated
      const statsAfter = await mockFs.fs.lstat(targetPath);
      expect(statsAfter.isSymbolicLink()).toBe(true);

      // Verify it still points to the correct target
      const linkTarget = await mockFs.fs.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      expect(resolvedTarget).toBe(path.resolve(sourcePath));
    });

    it("should replace symlink if it points to wrong target", async () => {
      const oldSourcePath = path.join(testDirs.paths.binariesDir, "tool", "0.9.0", "bin", "tool");
      const newSourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create both source binaries
      await mockFs.fs.ensureDir(path.dirname(oldSourcePath));
      await mockFs.fs.writeFile(oldSourcePath, '#!/bin/bash\necho "old"');
      await mockFs.fs.chmod(oldSourcePath, 0o755);

      await mockFs.fs.ensureDir(path.dirname(newSourcePath));
      await mockFs.fs.writeFile(newSourcePath, '#!/bin/bash\necho "new"');
      await mockFs.fs.chmod(newSourcePath, 0o755);

      // Create symlink to old version
      await mockFs.fs.ensureDir(path.dirname(targetPath));
      await mockFs.fs.symlink(oldSourcePath, targetPath);

      // Verify initial symlink points to old version
      const initialTarget = await mockFs.fs.readlink(targetPath);
      const resolvedInitial = path.resolve(path.dirname(targetPath), initialTarget);
      expect(resolvedInitial).toBe(path.resolve(oldSourcePath));

      // Update symlink to new version
      await symlinkGenerator.createBinarySymlink(logger, newSourcePath, targetPath);

      // Verify symlink now points to new version
      const linkTarget = await mockFs.fs.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      expect(resolvedTarget).toBe(path.resolve(newSourcePath));
    });

    it("should replace regular file with symlink", async () => {
      const sourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create source binary
      await mockFs.fs.ensureDir(path.dirname(sourcePath));
      await mockFs.fs.writeFile(sourcePath, '#!/bin/bash\necho "tool"');
      await mockFs.fs.chmod(sourcePath, 0o755);

      // Create regular file at target location
      await mockFs.fs.ensureDir(path.dirname(targetPath));
      await mockFs.fs.writeFile(targetPath, "old file content");

      // Create symlink - should replace the regular file
      await symlinkGenerator.createBinarySymlink(logger, sourcePath, targetPath);

      // Verify target is now a symlink
      const stats = await mockFs.fs.lstat(targetPath);
      expect(stats.isSymbolicLink()).toBe(true);

      const linkTarget = await mockFs.fs.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      expect(resolvedTarget).toBe(path.resolve(sourcePath));
    });

    it("should throw error if source binary does not exist", async () => {
      const sourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "nonexistent");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Don't create source binary

      // Attempt to create symlink - should fail
      expect(symlinkGenerator.createBinarySymlink(logger, sourcePath, targetPath)).rejects.toThrow(
        `Cannot create symlink: binary does not exist at ${sourcePath}`,
      );
    });

    it("should remove invalid symlink (pointing to non-existent target)", async () => {
      const oldSourcePath = path.join(testDirs.paths.binariesDir, "tool", "0.9.0", "bin", "tool");
      const newSourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create old source binary first, create symlink, then delete it to simulate cleanup
      await mockFs.fs.ensureDir(path.dirname(oldSourcePath));
      await mockFs.fs.writeFile(oldSourcePath, '#!/bin/bash\necho "old"');
      await mockFs.fs.chmod(oldSourcePath, 0o755);

      // Create symlink to old version
      await mockFs.fs.ensureDir(path.dirname(targetPath));
      await mockFs.fs.symlink(oldSourcePath, targetPath);

      // Verify initial symlink
      const initialTarget = await mockFs.fs.readlink(targetPath);
      expect(path.resolve(path.dirname(targetPath), initialTarget)).toBe(path.resolve(oldSourcePath));

      // Delete the old source binary (simulating version cleanup)
      await mockFs.fs.rm(oldSourcePath);

      // Create new source binary
      await mockFs.fs.ensureDir(path.dirname(newSourcePath));
      await mockFs.fs.writeFile(newSourcePath, '#!/bin/bash\necho "new"');
      await mockFs.fs.chmod(newSourcePath, 0o755);

      // Create symlink to new version - should remove invalid old symlink and create new one
      await symlinkGenerator.createBinarySymlink(logger, newSourcePath, targetPath);

      // Verify symlink now points to new version
      const linkTarget = await mockFs.fs.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      expect(resolvedTarget).toBe(path.resolve(newSourcePath));

      // Verify the new target exists
      const stats = await mockFs.fs.stat(resolvedTarget);
      expect(stats.isFile()).toBe(true);
    });

    it("should handle relative symlink paths correctly", async () => {
      const sourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create source binary
      await mockFs.fs.ensureDir(path.dirname(sourcePath));
      await mockFs.fs.writeFile(sourcePath, '#!/bin/bash\necho "tool"');
      await mockFs.fs.chmod(sourcePath, 0o755);

      // Create symlink
      await symlinkGenerator.createBinarySymlink(logger, sourcePath, targetPath);

      // Verify symlink can be read and resolved correctly
      const linkTarget = await mockFs.fs.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);

      expect(await mockFs.fs.exists(resolvedTarget)).toBe(true);

      // Read the content through the symlink
      const content = await mockFs.fs.readFile(targetPath, "utf-8");
      expect(content).toBe('#!/bin/bash\necho "tool"');
    });

    it("should verify symlink points to correct target after creation", async () => {
      const sourcePath = path.join(testDirs.paths.binariesDir, "tool", "1.0.0", "bin", "tool");
      const targetPath = path.join(testDirs.paths.binariesDir, "tool", "tool");

      // Create source binary
      await mockFs.fs.ensureDir(path.dirname(sourcePath));
      await mockFs.fs.writeFile(sourcePath, '#!/bin/bash\necho "tool"');
      await mockFs.fs.chmod(sourcePath, 0o755);

      // Mock readlink to return wrong target to simulate verification failure
      const originalReadlink = mockFs.fs.readlink.bind(mockFs.fs);
      let readlinkCallCount = 0;
      const readlinkResponses = new Map([[2, async () => "/wrong/path"]]);
      mockFs.spies.readlink.mockImplementation(async (linkPath: string) => {
        readlinkCallCount++;
        const readlinkHandler = readlinkResponses.get(readlinkCallCount) ?? (() => originalReadlink(linkPath));
        return readlinkHandler();
      });

      // Attempt to create symlink - should fail verification
      expect(symlinkGenerator.createBinarySymlink(logger, sourcePath, targetPath)).rejects.toThrow(
        /Symlink verification failed/,
      );
    });
  });

  describe("platform-specific symlinks", () => {
    it("should resolve symlinks defined in platformConfigs for matching platform", async () => {
      const sourcePath = "src/config.toml";
      const targetPath = "~/.config/tool/config.toml";
      const sourceFullPath = getSourcePath(sourcePath);
      const targetFullPath = path.join(projectConfig.paths.homeDir, ".config/tool/config.toml");

      // Create tool config with symlinks only in platformConfigs (no base symlinks)
      const toolConfigWithPlatformSymlinks: ToolConfig = {
        name: "platform-tool",
        binaries: ["platform-tool"],
        version: "1.0.0",
        configFilePath: path.join(testDirs.paths.toolConfigsDir, "platform-tool.tool.ts"),
        installationMethod: "brew",
        installParams: { formula: "platform-tool" },
        platformConfigs: [
          {
            platforms: Platform.Linux, // Matches systemInfo.platform set in beforeEach
            config: {
              symlinks: [{ source: sourcePath, target: targetPath }],
            },
          },
        ],
      };

      await mockFs.addFiles({ [sourceFullPath]: "config content" });

      const results = await symlinkGenerator.generate({ "platform-tool": toolConfigWithPlatformSymlinks });

      expect(await mockFs.fs.exists(targetFullPath)).toBe(true);
      expect(await mockFs.fs.readlink(targetFullPath)).toBe(sourceFullPath);
      expect(results).toEqual([
        {
          success: true,
          sourcePath: sourceFullPath,
          targetPath: targetFullPath,
          status: "created",
        },
      ]);
    });

    it("should not process symlinks from platformConfigs for non-matching platform", async () => {
      const sourcePath = "src/config.toml";
      const targetPath = "~/.config/tool/config.toml";
      const sourceFullPath = getSourcePath(sourcePath);
      const targetFullPath = path.join(projectConfig.paths.homeDir, ".config/tool/config.toml");

      // Create tool config with symlinks only in platformConfigs for macOS (non-matching)
      const toolConfigWithPlatformSymlinks: ToolConfig = {
        name: "macos-only-tool",
        binaries: ["macos-tool"],
        version: "1.0.0",
        configFilePath: path.join(testDirs.paths.toolConfigsDir, "macos-tool.tool.ts"),
        installationMethod: "brew",
        installParams: { formula: "macos-tool", cask: true },
        platformConfigs: [
          {
            platforms: Platform.MacOS, // Does NOT match systemInfo.platform (Linux)
            config: {
              symlinks: [{ source: sourcePath, target: targetPath }],
            },
          },
        ],
      };

      await mockFs.addFiles({ [sourceFullPath]: "config content" });

      const results = await symlinkGenerator.generate({ "macos-only-tool": toolConfigWithPlatformSymlinks });

      // Should not create symlink because platform doesn't match
      expect(await mockFs.fs.exists(targetFullPath)).toBe(false);
      expect(results).toEqual([]);
    });
  });

  describe("TrackedFileSystem integration", () => {
    let registryDatabase: RegistryDatabase;
    let registry: FileRegistry;
    let trackedFs: TrackedFileSystem;
    let dbPath: string;

    beforeEach(async () => {
      dbPath = path.join("/tmp", `test-symlink-gen-${randomUUID()}.db`);
      registryDatabase = new RegistryDatabase(logger, dbPath);
      registry = new FileRegistry(logger, registryDatabase.getConnection());

      const resolvedFs = new ResolvedFileSystem(mockFs.fs, testDirs.paths.homeDir);
      const context = TrackedFileSystem.createContext("test-tool", "symlink");
      trackedFs = new TrackedFileSystem(logger, resolvedFs, registry, context, projectConfig);

      // Recreate SymlinkGenerator with TrackedFileSystem
      symlinkGenerator = new SymlinkGenerator(logger, trackedFs, projectConfig, systemInfo);
    });

    afterEach(async () => {
      await registry.close();
      registryDatabase.close();
      try {
        await unlink(dbPath);
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should register symlink in registry even when symlink already exists and is correct", async () => {
      const sourcePath = "src/config.txt";
      const targetPath = ".config.txt";
      const sourceFullPath = getSourcePath(sourcePath);
      const targetFullPath = getTargetPath(targetPath);

      const toolConfigs = {
        tool1: createToolConfig([{ source: sourcePath, target: targetPath }]),
      };
      await mockFs.addFiles({ [sourceFullPath]: "content" });

      // First generate run - creates symlink and registers it
      const results1 = await symlinkGenerator.generate(toolConfigs);
      expect(results1[0]?.status).toBe("created");

      // Verify symlink is registered
      const statesAfterFirst = await registry.getFileStatesForTool("tool1");
      expect(statesAfterFirst).toHaveLength(1);
      expect(statesAfterFirst[0]?.filePath).toBe(targetFullPath);

      // Clear the registry to simulate fresh state (but symlink still exists on disk)
      await registry.removeToolOperations("tool1");
      const statesAfterClear = await registry.getFileStatesForTool("tool1");
      expect(statesAfterClear).toHaveLength(0);

      // Second generate run - symlink already exists and is correct
      const results2 = await symlinkGenerator.generate(toolConfigs);
      expect(results2[0]?.status).toBe("skipped_correct");

      // Verify symlink is re-registered in registry
      const statesAfterSecond = await registry.getFileStatesForTool("tool1");
      expect(statesAfterSecond).toHaveLength(1);
      expect(statesAfterSecond[0]?.filePath).toBe(targetFullPath);
      expect(statesAfterSecond[0]?.targetPath).toBe(sourceFullPath);
    });
  });
});
