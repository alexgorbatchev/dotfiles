import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  createMockSymlinkGenerator,
  createTestContext,
  type IInstallerTestSetup,
  MOCK_TOOL_NAME,
} from "../../__tests__/installer-test-helpers";
import { InstallationStateWriter } from "../InstallationStateWriter";

describe("InstallationStateWriter", () => {
  let setup: IInstallerTestSetup;
  let stateWriter: InstallationStateWriter;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();

    stateWriter = new InstallationStateWriter({
      projectConfig: setup.mockProjectConfig,
      toolInstallationRegistry: setup.mockToolInstallationRegistry,
      symlinkGenerator: createMockSymlinkGenerator(setup.fs),
    });
  });

  it("should record installation with mapped installMethod metadata", async () => {
    const toolConfig = createGithubReleaseToolConfig();
    const installedDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "1.0.0");
    const binaryPath = path.join(installedDir, MOCK_TOOL_NAME);
    const context = createTestContext(setup, { timestamp: "2025-02-03-04-05-06" });

    await stateWriter.recordInstallation(
      MOCK_TOOL_NAME,
      toolConfig,
      installedDir,
      context,
      {
        success: true,
        binaryPaths: [binaryPath],
        version: "1.0.0",
        originalTag: "v1.0.0",
        metadata: {
          method: "github-release",
          downloadUrl: "https://example.com/test-tool.tar.gz",
          assetName: "test-tool.tar.gz",
          releaseUrl: "https://example.com/releases/tag/v1.0.0",
          publishedAt: "2025-02-03T04:05:06.000Z",
          releaseName: "v1.0.0",
        },
      },
      setup.logger,
    );

    expect(setup.mockToolInstallationRegistry.recordToolInstallation).toHaveBeenCalledTimes(1);

    const firstCall = setup.mockToolInstallationRegistry.recordToolInstallation.mock.calls[0];
    assert(firstCall !== undefined);

    const installationRecord = firstCall[0];
    expect(installationRecord).toEqual(
      expect.objectContaining({
        toolName: MOCK_TOOL_NAME,
        version: "1.0.0",
        installPath: installedDir,
        timestamp: "2025-02-03-04-05-06",
        binaryPaths: [binaryPath],
        originalTag: "v1.0.0",
        installMethod: "github-release",
        downloadUrl: "https://example.com/test-tool.tar.gz",
        assetName: "test-tool.tar.gz",
      }),
    );
    expect(installationRecord).not.toHaveProperty("method");
  });

  it("should create binary entrypoints for externally managed tools", async () => {
    const toolFs = setup.trackedFs.withToolName(MOCK_TOOL_NAME);
    const externalBinaryPath = "/opt/homebrew/bin/test-tool";
    const installedDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "external");

    await setup.fs.ensureDir("/opt/homebrew/bin");
    await setup.fs.writeFile(externalBinaryPath, '#!/bin/bash\necho "test"');
    await setup.fs.chmod(externalBinaryPath, 0o755);

    await stateWriter.createBinaryEntrypoints(
      MOCK_TOOL_NAME,
      [externalBinaryPath],
      toolFs,
      setup.logger,
      installedDir,
      true,
    );

    const externalEntrypointPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "external", "test-tool");
    expect(await setup.fs.exists(externalEntrypointPath)).toBe(true);
    expect(await setup.fs.readlink(externalEntrypointPath)).toBe(externalBinaryPath);
  });

  it("should update current symlink to point to the installed directory", async () => {
    const toolFs = setup.trackedFs.withToolName(MOCK_TOOL_NAME);
    const installedDir = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "2025-03-10-12-30-00");
    const currentSymlinkPath = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, "current");

    await setup.fs.ensureDir(installedDir);

    await stateWriter.updateCurrentSymlink(MOCK_TOOL_NAME, toolFs, setup.logger, installedDir, false);

    expect(await setup.fs.exists(currentSymlinkPath)).toBe(true);
    expect(await setup.fs.readlink(currentSymlinkPath)).toBe("2025-03-10-12-30-00");
  });
});
