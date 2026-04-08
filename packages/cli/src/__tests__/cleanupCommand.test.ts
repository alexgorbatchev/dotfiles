import type { ProjectConfig } from "@dotfiles/config";
import type { MockedFileSystem } from "@dotfiles/file-system";
import type { TestLogger } from "@dotfiles/logger";
import { createMockFileRegistry } from "@dotfiles/registry/file";
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from "@rageltd/bun-test-utils";
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { registerCleanupCommand } from "../cleanupCommand";
import type { IGlobalProgram } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

setupTestCleanup();

const mockModules = createModuleMocker();

describe("cleanupCommand", () => {
  let program: IGlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let mockFs: MockedFileSystem;
  let mockFileRegistry: ReturnType<typeof createMockFileRegistry>;
  let logger: TestLogger;
  let mockShim1 = "";
  let mockShim2 = "";
  let mockShellInit = "";
  let mockSymlinkTarget = "";
  let mockSymlinkSource = "";
  const runCommand = (args: string[]) => program.parseAsync(["cleanup", ...args], { from: "user" });

  beforeEach(async () => {
    mock.restore();

    // Create mock file registry and override specific methods
    mockFileRegistry = createMockFileRegistry();

    // Override getFileStatesForTool to return our test data
    mockFileRegistry.getFileStatesForTool = mock(
      async (toolName: string) =>
        new Map([
          [
            "tool1",
            [
              {
                filePath: mockShim1,
                toolName: "tool1",
                fileType: "shim" as const,
                lastOperation: "writeFile" as const,
                lastModified: Date.now(),
              },
              {
                filePath: mockShim2,
                toolName: "tool1",
                fileType: "shim" as const,
                lastOperation: "writeFile" as const,
                lastModified: Date.now(),
              },
              {
                filePath: mockShellInit,
                toolName: "tool1",
                fileType: "init" as const,
                lastOperation: "writeFile" as const,
                lastModified: Date.now(),
              },
              {
                filePath: mockSymlinkSource,
                toolName: "tool1",
                fileType: "symlink" as const,
                lastOperation: "symlink" as const,
                targetPath: mockSymlinkTarget,
                lastModified: Date.now(),
              },
            ],
          ],
        ]).get(toolName) ?? [],
    );

    // Override getRegisteredTools to return our test tool
    mockFileRegistry.getRegisteredTools = mock(async () => ["tool1"]);

    const setup = await createCliTestSetup({
      testName: "cleanup-command",
      services: {
        fileRegistry: mockFileRegistry,
      },
    });

    program = setup.program;
    logger = setup.logger;
    mockFs = setup.mockFs.fs;
    mockProjectConfig = setup.mockProjectConfig;

    const { addFiles, addSymlinks } = setup.mockFs;
    mockShim1 = "/usr/bin/shim1";
    mockShim2 = `${mockProjectConfig.paths.generatedDir}/bin/shim2`;
    mockShellInit = `${mockProjectConfig.paths.shellScriptsDir}/main.zsh`;
    mockSymlinkSource = `${mockProjectConfig.paths.dotfilesDir}/tool/config.yml`;
    mockSymlinkTarget = `${mockProjectConfig.paths.targetDir}/.config/tool/config.yml`;

    // Files are set up in the mock filesystem

    addFiles({
      [mockSymlinkSource]: "content",
      [mockShim1]: "content",
      [mockShim2]: "content",
      [mockShellInit]: "content",
    });

    addSymlinks({
      [mockSymlinkSource]: mockSymlinkTarget,
    });

    registerCleanupCommand(logger, program, async () => setup.createServices());
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  it("should successfully cleanup with registry-based cleanup (default --all)", async () => {
    await runCommand([]);

    // Registry-based cleanup should remove tracked files
    expect(mockFs.rm).toHaveBeenCalledWith(mockShim1, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockShim2, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockShellInit, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockSymlinkTarget, { force: true });

    logger.expect(
      ["INFO"],
      ["registerCleanupCommand"],
      [],
      [
        "Registry-based cleanup: Removing all tracked files",
        "[cleanup] rm /usr/bin/shim1",
        "[cleanup] rm ~/.generated/bin/shim2",
        "[cleanup] rm ~/.generated/shell-scripts/main.zsh",
        "[cleanup] rm ~/.generated/bin-default/.config/tool/config.yml",
        "registry database cleanup",
      ],
    );
  });

  it("should cleanup specific tool when --tool flag is used", async () => {
    await runCommand(["--tool", "tool1"]);

    expect(mockFs.rm).toHaveBeenCalledWith(mockShim1, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockShim2, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockShellInit, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockSymlinkTarget, { force: true });

    logger.expect(
      ["INFO"],
      ["registerCleanupCommand"],
      [],
      [
        "Registry-based cleanup: files for tool 'tool1'",
        "[cleanup] rm /usr/bin/shim1",
        "[cleanup] rm ~/.generated/bin/shim2",
        "[cleanup] rm ~/.generated/shell-scripts/main.zsh",
        "[cleanup] rm ~/.generated/bin-default/.config/tool/config.yml",
        "Removed registry entries for tool: tool1",
      ],
    );
  });

  it("should not delete any files in dry run mode", async () => {
    await runCommand(["--dry-run"]);

    expect(mockFs.rm).not.toHaveBeenCalled();

    logger.expect(
      ["INFO"],
      ["registerCleanupCommand"],
      [],
      [
        "Registry-based cleanup: Removing all tracked files",
        `Would delete: /usr/bin/shim1`,
        `Would delete: ${mockShim2}`,
        `Would delete: ${mockShellInit}`,
        `Would delete: ${mockSymlinkTarget}`,
        "Would clean up registry database (dry run)",
      ],
    );
  });
});
