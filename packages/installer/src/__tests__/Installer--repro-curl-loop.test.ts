import type { AggregateInstallResult, IInstallContext, ToolConfig } from "@dotfiles/core";
import type { IToolInstallationRecord } from "@dotfiles/registry/tool";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import path from "node:path";
import { createInstallerTestSetup, type IInstallerTestSetup, MOCK_TOOL_NAME } from "./installer-test-helpers";

describe("Installer - Reproduction of curl-script loop issue", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("should create a new directory every time and NOT create a symlink for non-externally managed tools without version", async () => {
    const toolConfig: ToolConfig = {
      name: MOCK_TOOL_NAME,
      binaries: [MOCK_TOOL_NAME],
      version: "latest",
      installationMethod: "curl-script",
      installParams: {
        url: "https://example.com/install.sh",
        shell: "bash",
      },
    };

    const installSpy = spyOn(setup.pluginRegistry, "install").mockImplementation(
      async (
        _parentLogger,
        _method: string,
        _toolName: string,
        _toolConfig: unknown,
        context: IInstallContext,
      ): Promise<AggregateInstallResult> => {
        const binaryPath: string = path.join(context.stagingDir, MOCK_TOOL_NAME);

        await setup.fs.ensureDir(path.dirname(binaryPath));
        await setup.fs.writeFile(binaryPath, "mock binary");
        await setup.fs.chmod(binaryPath, 0o755);

        const result: AggregateInstallResult = {
          success: true,
          binaryPaths: [binaryPath],
          metadata: {
            method: "curl-script",
            scriptUrl: "https://example.com/install.sh",
            shell: "bash",
          },
        };
        return result;
      },
    );

    // First installation
    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Check that ensureDir was called with a per-attempt staging directory (UUID)
    const ensureDirCalls1 = setup.fileSystemMocks.ensureDir.mock.calls;
    const installDirCall1 = ensureDirCalls1.find(
      (call) =>
        call[0].includes(MOCK_TOOL_NAME) &&
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(call[0]),
    );
    expect(installDirCall1).toBeDefined();

    const symlinkCalls = setup.fileSystemMocks.symlink.mock.calls;
    const toolDir = path.join(setup.mockProjectConfig.paths.generatedDir, "binaries", MOCK_TOOL_NAME);
    const expectedCurrentSymlinkPath: string = path.join(toolDir, "current");

    const currentSymlinkCall = symlinkCalls.find((call) => call[1] === expectedCurrentSymlinkPath);
    expect(currentSymlinkCall).toBeDefined();
    expect(currentSymlinkCall![0]).toMatch(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/);

    setup.mockToolInstallationRegistry.getToolInstallation.mockImplementation(async () => {
      const currentDir = path.join(toolDir, "current");
      const result: IToolInstallationRecord = {
        id: 1,
        toolName: MOCK_TOOL_NAME,
        version: "latest",
        installPath: currentDir,
        timestamp: "2024-01-01",
        binaryPaths: [path.join(currentDir, MOCK_TOOL_NAME)],
        installedAt: new Date(),
      };
      return result;
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Expect installSpy to be called ONLY ONCE (for the first install)
    expect(installSpy).toHaveBeenCalledTimes(1);

    installSpy.mockRestore();
  });
});
