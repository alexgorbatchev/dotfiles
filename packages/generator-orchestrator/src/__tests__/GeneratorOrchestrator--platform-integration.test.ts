import type { ProjectConfig } from "@dotfiles/config";
import type { ISystemInfo, PlatformConfig, ToolConfig } from "@dotfiles/core";
import { always, Architecture, architectureToString, Platform, platformToString } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import { createMemFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import type { TrackedFileSystem } from "@dotfiles/registry/file";
import type {
  ICompletionGenerator,
  IShellInitGenerationResult,
  IShellInitGenerator,
} from "@dotfiles/shell-init-generator";
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

/**
 * Creates a mock TrackedFileSystem for testing.
 */
function createMockTrackedFileSystem(fs: IFileSystem): TrackedFileSystem {
  const mockTrackedFs: TrackedFileSystem = {
    ...fs,
    withContext: mock(() => mockTrackedFs),
    setSuppressLogging: mock(() => {}),
  } as unknown as TrackedFileSystem;
  return mockTrackedFs;
}

// Helper function to generate platform-specific content
function generatePlatformContent(toolConfigs: Record<string, ToolConfig>, systemInfo: ISystemInfo): string {
  let content = "";

  for (const [toolName, config] of Object.entries(toolConfigs)) {
    if (config.platformConfigs) {
      for (const platformConfig of config.platformConfigs) {
        const isMatch =
          ((platformConfig.platforms & Platform.MacOS) !== 0 && systemInfo.platform === Platform.MacOS) ||
          ((platformConfig.platforms & Platform.Linux) !== 0 && systemInfo.platform === Platform.Linux);

        const platformCfg = platformConfig.config as PlatformConfig;
        if (isMatch && platformCfg.shellConfigs?.zsh?.scripts) {
          content += `# Platform-specific content for ${toolName}: ${platformCfg.shellConfigs.zsh.scripts
            .map((s) => s.value)
            .join(" ")}\n`;
        }
      }
    }
  }

  return content;
}

// Helper function to create mock shell content
function createMockShellContent(toolConfigs: Record<string, ToolConfig>, systemInfo?: ISystemInfo): string {
  let mockContent = "# Generated shell init\n";

  if (systemInfo) {
    mockContent += `# Platform: ${platformToString(systemInfo.platform)}\n`;
    mockContent += `# Arch: ${architectureToString(systemInfo.arch)}\n`;
    mockContent += generatePlatformContent(toolConfigs, systemInfo);
  }

  return mockContent;
}

describe("GeneratorOrchestrator - Platform Integration Tests", () => {
  let mockFileSystem: IFileSystem;
  let orchestrator: GeneratorOrchestrator;
  let logger: TestLogger;
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let mockCopyGenerator: ICopyGenerator;
  let mockCompletionGenerator: ICompletionGenerator;
  let mockProjectConfig: ProjectConfig;
  let macosSystemInfo: ISystemInfo;
  let linuxSystemInfo: ISystemInfo;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: "orchestrator-platform-integration" });

    macosSystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    linuxSystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    };

    // Create mock generators
    mockShimGenerator = {
      generate: async () => Promise.resolve(["/test/bin/shim1", "/test/bin/shim2"]),
      generateForTool: async () => Promise.resolve([]),
    };

    mockShellInitGenerator = {
      generate: async (toolConfigs, options) => {
        const shellFilePath = path.join(testDirs.paths.shellScriptsDir, "main.zsh");
        const mockResult: IShellInitGenerationResult = {
          files: new Map([["zsh", shellFilePath]]),
          primaryPath: shellFilePath,
        };

        const mockContent = createMockShellContent(toolConfigs, options?.systemInfo);

        await mockFileSystem.ensureDir(testDirs.paths.shellScriptsDir);
        await mockFileSystem.writeFile(path.join(testDirs.paths.shellScriptsDir, "main.zsh"), mockContent);
        return mockResult;
      },
    };

    mockSymlinkGenerator = {
      generate: async () => {
        const mockResult: SymlinkOperationResult = {
          success: true,
          sourcePath: "/test/src",

          targetPath: "/test/target",
          status: "created",
        };
        return [mockResult];
      },
      createBinarySymlink: async () => {},
    };

    mockCopyGenerator = {
      generate: async () => Promise.resolve([] as CopyOperationResult[]),
    };

    mockCompletionGenerator = {
      generateCompletionFile: async () =>
        Promise.resolve({
          content: "# completion",
          filename: "_tool",
          targetPath: "/path/_tool",
          generatedBy: "command" as const,
        }),
      generateAndWriteCompletionFile: async () =>
        Promise.resolve({
          content: "# completion",
          filename: "_tool",
          targetPath: "/path/_tool",
          generatedBy: "command" as const,
        }),
    };

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
      fileSystem: mockFileSystem,
      logger,
      systemInfo: macosSystemInfo,
      env: {},
    });
  });

  describe("systemInfo integration", () => {
    it("should pass systemInfo to shell generator for macOS platform-specific tools", async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockCopyGenerator,
        mockCompletionGenerator,
        macosSystemInfo, // macOS system info
        mockProjectConfig,
        createMockFileRegistry(),
        mockFileSystem,
        createMockTrackedFileSystem(mockFileSystem),
      );

      const toolConfigs: Record<string, ToolConfig> = {
        aerospace: {
          name: "aerospace",
          version: "latest",
          installationMethod: "manual",
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ["aerospace"],
                shellConfigs: {
                  zsh: {
                    scripts: [always(`# macOS aerospace init`)],
                  },
                },
              },
            },
          ],
        },
        "regular-tool": {
          name: "regular-tool",
          version: "latest",
          installationMethod: "github-release",
          installParams: { repo: "test/regular" },
          binaries: ["regular"],
          shellConfigs: {
            zsh: {
              scripts: [always(`# Regular tool init`)],
            },
          },
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Verify the shell generator received systemInfo and processed platform configs
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, "main.zsh"));
      expect(shellContent).toContain("# Platform: macos");
      expect(shellContent).toContain("# Arch: arm64");
      expect(shellContent).toContain("# Platform-specific content for aerospace: # macOS aerospace init");
    });

    it("should pass systemInfo to shell generator for Linux", async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockCopyGenerator,
        mockCompletionGenerator,
        linuxSystemInfo, // Linux system info
        mockProjectConfig,
        createMockFileRegistry(),
        mockFileSystem,
        createMockTrackedFileSystem(mockFileSystem),
      );

      const toolConfigs: Record<string, ToolConfig> = {
        "cross-platform-tool": {
          name: "cross-platform-tool",
          version: "latest",
          installationMethod: "manual",
          shellConfigs: {
            zsh: {
              scripts: [always(`# Base init`)],
            },
          },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: {
                  zsh: {
                    scripts: [always(`# macOS specific - should not appear`)],
                  },
                },
              },
            },
            {
              platforms: Platform.Linux,
              config: {
                shellConfigs: {
                  zsh: {
                    scripts: [always(`# Linux specific - should appear`)],
                  },
                },
              },
            },
          ],
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Verify the shell generator received Linux systemInfo
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, "main.zsh"));
      expect(shellContent).toContain("# Platform: linux");
      expect(shellContent).toContain("# Arch: x86_64");
      expect(shellContent).toContain(
        "# Platform-specific content for cross-platform-tool: # Linux specific - should appear",
      );
      expect(shellContent).not.toContain("# macOS specific - should not appear");
    });

    it("should handle tools with no platform configs", async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockCopyGenerator,
        mockCompletionGenerator,
        linuxSystemInfo,
        mockProjectConfig,
        createMockFileRegistry(),
        mockFileSystem,
        createMockTrackedFileSystem(mockFileSystem),
      );

      const toolConfigs: Record<string, ToolConfig> = {
        "simple-tool": {
          name: "simple-tool",
          version: "latest",
          installationMethod: "github-release",
          installParams: { repo: "test/simple" },
          binaries: ["simple"],
          shellConfigs: {
            zsh: {
              scripts: [always(`# Simple tool init`)],
            },
          },
          // No platform configs
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Should still work even with no platform configs
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, "main.zsh"));
      expect(shellContent).toContain("# Platform: linux");
      expect(shellContent).toContain("# Arch: x86_64");
      // No platform-specific content expected since there are no platform configs
    });
  });

  describe("full integration with multiple generators", () => {
    it("should coordinate all generators with platform-aware systemInfo", async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockCopyGenerator,
        mockCompletionGenerator,
        macosSystemInfo,
        mockProjectConfig,
        createMockFileRegistry(),
        mockFileSystem,
        createMockTrackedFileSystem(mockFileSystem),
      );

      const toolConfigs: Record<string, ToolConfig> = {
        "full-platform-tool": {
          name: "full-platform-tool",
          version: "latest",
          installationMethod: "manual",
          shellConfigs: {
            zsh: {
              scripts: [always(`# Base shell init`)],
            },
          },
          symlinks: [{ source: "./base.conf", target: "~/.base.conf" }],
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ["macos-binary"],
                shellConfigs: {
                  zsh: {
                    scripts: [always(`# macOS shell init`)],
                  },
                },
                symlinks: [{ source: "./macos.conf", target: "~/.macos.conf" }],
              },
            },
          ],
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Verify shell content includes platform-aware information
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, "main.zsh"));
      expect(shellContent).toContain("# Platform: macos");
      expect(shellContent).toContain("# Platform-specific content for full-platform-tool: # macOS shell init");
    });
  });
});
