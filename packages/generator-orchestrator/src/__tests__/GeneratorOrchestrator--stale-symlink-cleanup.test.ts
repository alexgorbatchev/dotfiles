import type { ProjectConfig } from "@dotfiles/config";
import { Architecture, type ISystemInfo, Platform, type ToolConfig } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import { createMemFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import type { TrackedFileSystem } from "@dotfiles/registry/file";
import type { ICompletionGenerator, IShellInitGenerator } from "@dotfiles/shell-init-generator";
import type { IShimGenerator } from "@dotfiles/shim-generator";
import type {
  CopyOperationResult,
  ICopyGenerator,
  ISymlinkGenerator,
  SymlinkOperationResult,
} from "@dotfiles/symlink-generator";
import {
  createMockFileRegistry,
  createMockProjectConfig,
  createTestDirectories,
  type ITestDirectories,
} from "@dotfiles/testing-helpers";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";
import { GeneratorOrchestrator } from "../GeneratorOrchestrator";

function createMockTrackedFileSystem(fs: IFileSystem): TrackedFileSystem {
  const mockTrackedFs: TrackedFileSystem = {
    ...fs,
    withContext: mock(() => mockTrackedFs),
    setSuppressLogging: mock(() => {}),
  } as unknown as TrackedFileSystem;
  return mockTrackedFs;
}

describe("GeneratorOrchestrator - Stale Symlink Cleanup", () => {
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let mockCopyGenerator: ICopyGenerator;
  let mockCompletionGenerator: ICompletionGenerator;
  let mockFileSystem: IFileSystem;
  let mockProjectConfig: ProjectConfig;
  let orchestrator: GeneratorOrchestrator;
  let logger: TestLogger;
  let testDirs: ITestDirectories;
  let systemInfo: ISystemInfo;
  let fileRegistry: ReturnType<typeof createMockFileRegistry>;

  beforeEach(async () => {
    mock.restore();
    logger = new TestLogger();

    mockShimGenerator = {
      generate: mock(async () => Promise.resolve([] as string[])),
      generateForTool: mock(async () => Promise.resolve([])),
    };
    mockShellInitGenerator = {
      generate: mock(async () =>
        Promise.resolve({
          files: new Map(),
          primaryPath: null,
        }),
      ),
    };
    mockSymlinkGenerator = {
      generate: mock(async () => Promise.resolve([] as SymlinkOperationResult[])),
      createBinarySymlink: mock(async () => {}),
    };
    mockCopyGenerator = {
      generate: mock(async () => Promise.resolve([] as CopyOperationResult[])),
    };
    mockCompletionGenerator = {
      generateCompletionFile: mock(async () =>
        Promise.resolve({
          content: "# completion",
          filename: "_tool",
          targetPath: "/path/_tool",
          generatedBy: "command" as const,
        }),
      ),
      generateAndWriteCompletionFile: mock(async () =>
        Promise.resolve({
          content: "# completion",
          filename: "_tool",
          targetPath: "/path/_tool",
          generatedBy: "command" as const,
        }),
      ),
    };

    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;

    testDirs = await createTestDirectories(logger, mockFileSystem, {
      testName: "generator-orchestrator-stale-symlink",
    });

    systemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem: mockFileSystem,
      logger,
      systemInfo,
      env: {},
    });

    fileRegistry = createMockFileRegistry();

    orchestrator = new GeneratorOrchestrator(
      logger,
      mockShimGenerator,
      mockShellInitGenerator,
      mockSymlinkGenerator,
      mockCopyGenerator,
      mockCompletionGenerator,
      systemInfo,
      mockProjectConfig,
      fileRegistry,
      mockFileSystem,
      createMockTrackedFileSystem(mockFileSystem),
    );
  });

  describe("cleanup for stale symlinks on active tools", () => {
    it("should remove a symlink when its declaration is removed from an active tool", async () => {
      const staleSymlinkPath = path.join(testDirs.paths.homeDir, ".old-config");
      const activeSymlinkPath = path.join(testDirs.paths.homeDir, ".active-config");

      await mockFileSystem.ensureDir(path.dirname(staleSymlinkPath));
      await mockFileSystem.writeFile(staleSymlinkPath, "stale symlink content");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: staleSymlinkPath,
      });
      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: activeSymlinkPath,
      });

      const symlinkResults: SymlinkOperationResult[] = [
        {
          success: true,
          sourcePath: path.join(testDirs.paths.dotfilesDir, "active-config"),
          targetPath: activeSymlinkPath,
          status: "created",
        },
      ];
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(symlinkResults);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: [],
        version: "1.0",
        symlinks: [{ source: "active-config", target: "~/.active-config" }],
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(await mockFileSystem.exists(staleSymlinkPath)).toBe(false);
    });

    it("should not remove symlinks that are still declared", async () => {
      const activeSymlinkPath = path.join(testDirs.paths.homeDir, ".active-config");

      await mockFileSystem.ensureDir(path.dirname(activeSymlinkPath));
      await mockFileSystem.writeFile(activeSymlinkPath, "active symlink content");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: activeSymlinkPath,
      });

      const symlinkResults: SymlinkOperationResult[] = [
        {
          success: true,
          sourcePath: path.join(testDirs.paths.dotfilesDir, "active-config"),
          targetPath: activeSymlinkPath,
          status: "skipped_correct",
        },
      ];
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(symlinkResults);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: [],
        version: "1.0",
        symlinks: [{ source: "active-config", target: "~/.active-config" }],
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(await mockFileSystem.exists(activeSymlinkPath)).toBe(true);
    });

    it("should handle tool with no previously tracked symlinks", async () => {
      const symlinkResults: SymlinkOperationResult[] = [
        {
          success: true,
          sourcePath: path.join(testDirs.paths.dotfilesDir, "new-config"),
          targetPath: path.join(testDirs.paths.homeDir, ".new-config"),
          status: "created",
        },
      ];
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(symlinkResults);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: [],
        version: "1.0",
        symlinks: [{ source: "new-config", target: "~/.new-config" }],
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });
    });

    it("should remove all symlinks when all declarations are removed from an active tool", async () => {
      const symlink1Path = path.join(testDirs.paths.homeDir, ".config1");
      const symlink2Path = path.join(testDirs.paths.homeDir, ".config2");

      await mockFileSystem.ensureDir(path.dirname(symlink1Path));
      await mockFileSystem.writeFile(symlink1Path, "config1 content");
      await mockFileSystem.writeFile(symlink2Path, "config2 content");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: symlink1Path,
      });
      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: symlink2Path,
      });

      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: ["my-bin"],
        version: "1.0",
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(await mockFileSystem.exists(symlink1Path)).toBe(false);
      expect(await mockFileSystem.exists(symlink2Path)).toBe(false);
    });

    it("should log when removing stale symlinks", async () => {
      const staleSymlinkPath = path.join(testDirs.paths.homeDir, ".stale-config");

      await mockFileSystem.ensureDir(path.dirname(staleSymlinkPath));
      await mockFileSystem.writeFile(staleSymlinkPath, "stale content");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: staleSymlinkPath,
      });

      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: [],
        version: "1.0",
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      logger.expect(["WARN"], ["GeneratorOrchestrator", "cleanupStaleSymlinks"], [], [/Removing stale symlink/]);
    });

    it("should not affect non-symlink file states when cleaning up stale symlinks", async () => {
      const shimPath = path.join(mockProjectConfig.paths.targetDir, "my-bin");
      const staleSymlinkPath = path.join(testDirs.paths.homeDir, ".old-config");

      await mockFileSystem.ensureDir(path.dirname(shimPath));
      await mockFileSystem.writeFile(shimPath, "#!/bin/bash\nexec my-tool");
      await mockFileSystem.ensureDir(path.dirname(staleSymlinkPath));
      await mockFileSystem.writeFile(staleSymlinkPath, "stale content");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "shim",
        filePath: shimPath,
      });
      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: staleSymlinkPath,
      });

      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([shimPath]);
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: ["my-bin"],
        version: "1.0",
        installationMethod: "manual",
        installParams: {
          binaryPath: "./my-bin",
        },
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(await mockFileSystem.exists(staleSymlinkPath)).toBe(false);
      expect(await mockFileSystem.exists(shimPath)).toBe(true);
    });

    it("should record rm operation in registry so stale symlink is not reported again", async () => {
      const staleSymlinkPath = path.join(testDirs.paths.homeDir, ".stale-config");

      await mockFileSystem.ensureDir(path.dirname(staleSymlinkPath));
      await mockFileSystem.writeFile(staleSymlinkPath, "stale content");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: staleSymlinkPath,
      });

      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: [],
        version: "1.0",
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(fileRegistry.recordOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "myTool",
          operationType: "rm",
          filePath: staleSymlinkPath,
          fileType: "symlink",
        }),
      );
    });

    it("should not treat mkdir operations with symlink fileType as stale symlinks", async () => {
      const symlinkDirPath = path.join(testDirs.paths.homeDir, ".config", "myTool");
      const activeSymlinkPath = path.join(symlinkDirPath, "config.yml");

      await mockFileSystem.ensureDir(symlinkDirPath);
      await mockFileSystem.writeFile(activeSymlinkPath, "config content");

      // mkdir operation recorded with fileType 'symlink' (as TrackedFileSystem does)
      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: symlinkDirPath,
        lastOperation: "mkdir",
      });
      // actual symlink operation
      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: activeSymlinkPath,
      });

      const symlinkResults: SymlinkOperationResult[] = [
        {
          success: true,
          sourcePath: path.join(testDirs.paths.dotfilesDir, "config.yml"),
          targetPath: activeSymlinkPath,
          status: "skipped_correct",
        },
      ];
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(symlinkResults);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: [],
        version: "1.0",
        symlinks: [{ source: "config.yml", target: "~/.config/myTool/config.yml" }],
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(await mockFileSystem.exists(symlinkDirPath)).toBe(true);
      expect(await mockFileSystem.exists(activeSymlinkPath)).toBe(true);
      expect(fileRegistry.recordOperation).not.toHaveBeenCalled();
    });

    it("should not remove installer-created symlinks in the binaries directory", async () => {
      const currentSymlinkPath = path.join(mockProjectConfig.paths.binariesDir, "myTool", "current");

      await mockFileSystem.ensureDir(path.dirname(currentSymlinkPath));
      await mockFileSystem.writeFile(currentSymlinkPath, "current symlink placeholder");

      fileRegistry.setFileState({
        toolName: "myTool",
        fileType: "symlink",
        filePath: currentSymlinkPath,
      });

      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const toolConfig: ToolConfig = {
        name: "myTool",
        binaries: ["my-bin"],
        version: "1.0",
        installationMethod: "manual",
        installParams: {},
      };

      await orchestrator.generateAll({ myTool: toolConfig });

      expect(await mockFileSystem.exists(currentSymlinkPath)).toBe(true);
    });
  });
});
