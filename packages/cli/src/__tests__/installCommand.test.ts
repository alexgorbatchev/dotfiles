import type { IConfigService, ProjectConfig } from "@dotfiles/config";
import type { ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import type { IGeneratorOrchestrator } from "@dotfiles/generator-orchestrator";
import { getBinaryNames, type IInstaller, type InstallResult } from "@dotfiles/installer";
import type { TestLogger } from "@dotfiles/logger";
import type { IShimGenerator } from "@dotfiles/shim-generator";
import type { ICopyGenerator, ISymlinkGenerator } from "@dotfiles/symlink-generator";
import type { MockedInterface } from "@dotfiles/testing-helpers";
import { createInstallFunction } from "@dotfiles/tool-config-builder";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { registerInstallCommand } from "../installCommand";
import { messages } from "../log-messages";
import type { IGlobalProgram, IServices } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

type StderrChunk = string | Uint8Array;

const createMockConfigService = (): MockedInterface<IConfigService> => {
  const result: MockedInterface<IConfigService> = {
    loadSingleToolConfig: mock(async () => undefined),
    loadToolConfigByBinary: mock(async () => undefined),
    loadToolConfigs: mock(async () => ({})),
  };
  return result;
};

describe("installCommand", () => {
  let program: IGlobalProgram;
  let mockInstaller: MockedInterface<IInstaller>;
  let mockProjectConfig: ProjectConfig;
  let testLogger: TestLogger;
  let mockServices: IServices;
  let mockConfigService: MockedInterface<IConfigService>;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;
  let mockShimGenerator: MockedInterface<IShimGenerator>;
  let mockSymlinkGenerator: MockedInterface<ISymlinkGenerator>;
  let mockCopyGenerator: MockedInterface<ICopyGenerator>;
  let externallyManagedMethods: Set<string>;

  const toolAConfig: ToolConfig = {
    name: "toolA",
    version: "1.0.0",
    installationMethod: "manual",
    installParams: { binaryPath: "/usr/local/bin/toolA" },
    binaries: ["toolA"],
  };

  beforeEach(async () => {
    // Create custom installer mock with specific behavior
    mockInstaller = {
      install: mock(
        async (): Promise<InstallResult> => ({
          success: true,
          binaryPaths: ["/fake/bin/toolA"],
          version: "1.0.0",
          installationMethod: "brew",
          metadata: {
            method: "brew",
            formula: "test",
            isCask: false,
          },
        }),
      ),
    };

    const setup = await createCliTestSetup({
      testName: "install-command",
      services: {
        installer: mockInstaller,
      },
    });

    program = setup.program;
    testLogger = setup.logger;
    mockProjectConfig = setup.mockProjectConfig;
    mockServices = setup.createServices();

    // Set up mocks
    mockConfigService = createMockConfigService();

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => {}),
      generateCompletionsForTool: mock(async () => {}),
      cleanupToolArtifacts: mock(async () => {}),
    };

    mockShimGenerator = {
      generate: mock(async () => []),
      generateForTool: mock(async (_toolName: string, toolConfig: ToolConfig) => {
        const shimPaths: string[] = [];
        const binaryNames = getBinaryNames(toolConfig.binaries);

        for (const binaryName of binaryNames) {
          const shimPath = path.join(mockProjectConfig.paths.targetDir, binaryName);
          await setup.mockFs.fs.ensureDir(path.dirname(shimPath));
          await setup.mockFs.fs.writeFile(shimPath, "#!/usr/bin/env bash\nexit 0\n");
          shimPaths.push(shimPath);
        }

        return shimPaths;
      }),
    };

    mockSymlinkGenerator = {
      generate: mock(async () => []),
      createBinarySymlink: mock(async () => {}),
    };

    mockCopyGenerator = {
      generate: mock(async () => []),
    };

    externallyManagedMethods = new Set<string>();
    const pluginRegistry = mockServices.pluginRegistry;
    pluginRegistry.getExternallyManagedMethods = mock(() => externallyManagedMethods);

    registerInstallCommand(testLogger, program, async () => ({
      ...mockServices,
      configService: mockConfigService,
      generatorOrchestrator: mockGeneratorOrchestrator,
      shimGenerator: mockShimGenerator,
      symlinkGenerator: mockSymlinkGenerator,
      copyGenerator: mockCopyGenerator,
      pluginRegistry,
    }));
  });

  afterEach(() => {
    // Reset all mocks
    mockConfigService.loadSingleToolConfig.mockReset();
    mockConfigService.loadToolConfigByBinary.mockReset();
    mockConfigService.loadToolConfigs.mockReset();
  });

  test("should successfully install a tool", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(["install", "toolA"], { from: "user" });

    expect(mockConfigService.loadSingleToolConfig).toHaveBeenCalledWith(
      expect.any(Object),
      "toolA",
      mockProjectConfig.paths.toolConfigsDir,
      mockServices.fs,
      mockProjectConfig,
      expect.objectContaining({
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: mockProjectConfig.paths.homeDir,
      }),
    );
    expect(mockInstaller.install).toHaveBeenCalledWith("toolA", toolAConfig, {
      force: false,
      verbose: false,
      shimMode: false,
    });
    expect(mockShimGenerator.generateForTool).toHaveBeenCalledWith("toolA", toolAConfig, {
      overwrite: false,
      overwriteConflicts: false,
    });
    expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(
      { toolA: toolAConfig },
      { overwrite: true, backup: true },
    );
    expect(mockCopyGenerator.generate).toHaveBeenCalledWith({ toolA: toolAConfig }, { overwrite: true, backup: true });
    testLogger.expect(["INFO"], ["registerInstallCommand"], [], [messages.toolInstalled("toolA", "1.0.0", "brew")]);
  });

  test("should repair missing shim for an already-installed tool", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);
    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValueOnce({
      success: true,
      binaryPaths: ["/fake/bin/toolA"],
      version: "1.0.0",
      installationMethod: "already-installed",
    });

    await program.parseAsync(["install", "toolA"], { from: "user" });

    expect(mockShimGenerator.generateForTool).toHaveBeenCalledWith("toolA", toolAConfig, {
      overwrite: false,
      overwriteConflicts: false,
    });
    testLogger.expect(["INFO"], ["registerInstallCommand"], [], [messages.toolArtifactsRepaired("toolA")]);
  });

  test("should report healthy state for an already-installed tool with intact artifacts", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);
    const shimPath = path.join(mockProjectConfig.paths.targetDir, "toolA");
    await mockServices.fs.writeFile(shimPath, "#!/usr/bin/env bash\nexit 0\n");

    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValueOnce({
      success: true,
      binaryPaths: ["/fake/bin/toolA"],
      version: "1.0.0",
      installationMethod: "already-installed",
    });

    await program.parseAsync(["install", "toolA"], { from: "user" });

    testLogger.expect(["INFO"], ["registerInstallCommand"], [], [messages.toolAlreadyInstalled("toolA", "1.0.0")]);
  });

  test("should delete stale shims for already-installed externally managed tools", async () => {
    const brewToolConfig: ToolConfig = {
      name: "toolA",
      version: "1.0.0",
      installationMethod: "brew",
      installParams: { formula: "toolA" },
      binaries: ["toolA"],
    };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    externallyManagedMethods.add("brew");

    const shimPath = path.join(mockProjectConfig.paths.targetDir, "toolA");
    await mockServices.fs.writeFile(shimPath, "#!/usr/bin/env bash\nexit 0\n");

    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValueOnce({
      success: true,
      binaryPaths: ["/opt/homebrew/bin/toolA"],
      version: "1.0.0",
      installationMethod: "already-installed",
    });

    await program.parseAsync(["install", "toolA"], { from: "user" });

    expect(mockShimGenerator.generateForTool).not.toHaveBeenCalled();
    expect(await mockServices.fs.exists(shimPath)).toBe(false);
    testLogger.expect(["INFO"], ["registerInstallCommand"], [], [messages.toolArtifactsRepaired("toolA")]);
  });

  test("should skip installation for configuration-only tool configs", async () => {
    const install = createInstallFunction(testLogger, "config-tool");
    const configOnlyToolConfig = install()
      .zsh((shell) => shell.env({ CONFIG_ONLY: "1" }))
      .build();

    mockConfigService.loadSingleToolConfig.mockResolvedValue(configOnlyToolConfig);

    await program.parseAsync(["install", "config-tool"], { from: "user" });

    expect(mockInstaller.install).not.toHaveBeenCalled();
    expect(mockGeneratorOrchestrator.generateCompletionsForTool).toHaveBeenCalledWith(
      "config-tool",
      configOnlyToolConfig,
      undefined,
      undefined,
    );
  });

  test("should exit silently in shim mode when installation succeeds", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);

    expect(program.parseAsync(["install", "toolA", "--shim-mode"], { from: "user" })).rejects.toThrow(
      "MOCK_EXIT_CLI_CALLED_WITH_0",
    );

    expect(mockInstaller.install).toHaveBeenCalledWith("toolA", toolAConfig, {
      force: false,
      verbose: false,
      shimMode: true,
    });

    // Should not log success message in shim mode
    expect(() => testLogger.expect(["INFO"], ["registerInstallCommand"], [], [/installed successfully/])).toThrow();
  });

  test("should exit with error in shim mode when installation fails", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);
    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValueOnce({
      success: false,
      error: "Download failed: Network timeout",
    });

    // Error is logged by Installer at ERROR level (visible in QUIET/shim mode), CLI just exits
    expect(program.parseAsync(["install", "toolA", "--shim-mode"], { from: "user" })).rejects.toThrow(
      "MOCK_EXIT_CLI_CALLED_WITH_1",
    );
  });

  test("should output unhandled error to stderr in shim mode", async () => {
    mockConfigService.loadSingleToolConfig.mockRejectedValue(new Error("Config file corrupted"));

    const mockStderrWrite = mock((_chunk: StderrChunk) => true);
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = mockStderrWrite as typeof process.stderr.write;

    try {
      expect(program.parseAsync(["install", "toolA", "--shim-mode"], { from: "user" })).rejects.toThrow(
        "MOCK_EXIT_CLI_CALLED_WITH_1",
      );

      // Should output user-friendly error to stderr
      expect(mockStderrWrite).toHaveBeenCalledWith("Failed to install 'toolA': Config file corrupted\n");
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });

  test("should exit with error if tool config is not found", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);
    mockConfigService.loadToolConfigByBinary.mockResolvedValue(undefined);

    expect(program.parseAsync(["install", "nonexistent"], { from: "user" })).rejects.toThrow(
      "MOCK_EXIT_CLI_CALLED_WITH_1",
    );

    testLogger.expect(
      ["ERROR"],
      ["registerInstallCommand"],
      [],
      [messages.toolNotFoundByBinary("nonexistent", mockProjectConfig.paths.toolConfigsDir)],
    );
  });

  test("should exit with error if installation fails", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);
    const mockInstall = mockInstaller.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValue({
      success: false,
      error: "Installation failed",
    });

    // Error is logged by Installer, CLI just exits with code 1
    expect(program.parseAsync(["install", "toolA"], { from: "user" })).rejects.toThrow("MOCK_EXIT_CLI_CALLED_WITH_1");
  });

  test("should pass force option to installer", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolAConfig);

    await program.parseAsync(["install", "toolA", "--force"], { from: "user" });

    expect(mockInstaller.install).toHaveBeenCalledWith("toolA", toolAConfig, {
      force: true,
      verbose: false,
      shimMode: false,
    });
  });

  test("should install tools with installation defined only in platform-specific config", async () => {
    // This simulates tools like skhd that define installation only in platform configs:
    // install().platform(Platform.MacOS, (install) =>
    //   install('brew', { formula: 'koekeishiya/formulae/skhd' }).bin('skhd')
    // )
    // The base config appears as manual with no installParams/binaries
    const install = createInstallFunction(testLogger, "platform-only-tool");
    const platformOnlyToolConfig = install()
      .platform(Platform.Linux, (platformInstall) => platformInstall("brew", { formula: "test/formula" }))
      .build();

    mockConfigService.loadSingleToolConfig.mockResolvedValue(platformOnlyToolConfig);

    await program.parseAsync(["install", "platform-only-tool"], { from: "user" });

    // The installer SHOULD be called because platform config has installation steps
    expect(mockInstaller.install).toHaveBeenCalledWith(
      "platform-only-tool",
      platformOnlyToolConfig,
      expect.objectContaining({ force: false }),
    );
  });
});
