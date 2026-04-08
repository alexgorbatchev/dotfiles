/**
 * Integration tests for logger context propagation in the update command.
 *
 * Verifies that tool name context flows through log messages during updates.
 */
import type { IConfigService } from "@dotfiles/config";
import type { IInstallerPlugin, InstallerPluginRegistry } from "@dotfiles/core";
import type { IInstaller, InstallResult } from "@dotfiles/installer";
import type { GithubReleaseToolConfig, IGitHubReleaseInstallMetadata } from "@dotfiles/installer-github";
import type { TestLogger } from "@dotfiles/logger";
import type { IToolInstallationRecord, IToolInstallationRegistry } from "@dotfiles/registry/tool";
import type { MockedInterface } from "@dotfiles/testing-helpers";
import { beforeEach, describe, mock, test } from "bun:test";
import { messages } from "../log-messages";
import type { IGlobalProgram } from "../types";
import { registerUpdateCommand } from "../updateCommand";
import { createCliTestSetup } from "./createCliTestSetup";

describe("updateCommand - Logger Context Propagation", () => {
  let program: IGlobalProgram;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;
  let mockToolInstallationRegistry: MockedInterface<IToolInstallationRegistry>;
  let mockInstaller: MockedInterface<IInstaller>;
  let mockPluginRegistry: Partial<MockedInterface<InstallerPluginRegistry>>;

  const TOOL_NAME = "test-tool";

  const toolConfig: GithubReleaseToolConfig = {
    name: TOOL_NAME,
    version: "latest",
    installationMethod: "github-release",
    installParams: { repo: "owner/test-tool" },
    binaries: ["test-tool"],
  };

  const githubReleaseMetadata: IGitHubReleaseInstallMetadata = {
    method: "github-release",
    releaseUrl: "https://example.com/releases/v1.0.0",
    publishedAt: "2025-01-01T00:00:00Z",
    releaseName: "Release v1.0.0",
  };

  beforeEach(async () => {
    mockConfigService = {
      loadSingleToolConfig: mock(async () => toolConfig),
      loadToolConfigs: mock(async () => ({})),
      loadToolConfigByBinary: mock(async () => undefined),
    };

    mockToolInstallationRegistry = {
      recordToolInstallation: mock(async () => undefined),
      getToolInstallation: mock(async () => null),
      getAllToolInstallations: mock(async () => []),
      updateToolInstallation: mock(async () => undefined),
      removeToolInstallation: mock(async () => undefined),
      isToolInstalled: mock(async () => false),
      recordToolUsage: mock(async () => undefined),
      getToolUsage: mock(async () => null),
      close: mock(async () => undefined),
    };

    mockInstaller = {
      install: mock(
        async (): Promise<InstallResult> => ({
          success: true,
          binaryPaths: ["/fake/bin/test-tool"],
          version: "1.1.0",
          originalTag: "v1.1.0",
          metadata: githubReleaseMetadata,
        }),
      ),
    };

    mockPluginRegistry = {
      get: mock(() => ({ supportsUpdate: () => true }) as unknown as IInstallerPlugin),
      register: mock(async () => undefined),
      getAll: mock(() => []),
    };

    const setup = await createCliTestSetup({
      testName: "update-logger-context",
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        toolInstallationRegistry: mockToolInstallationRegistry,
        installer: mockInstaller,
      },
    });

    program = setup.program;
    logger = setup.logger;

    registerUpdateCommand(logger, program, async () => {
      const services = setup.createServices();

      services.configService = mockConfigService;
      services.toolInstallationRegistry = mockToolInstallationRegistry;
      services.installer = mockInstaller;
      services.pluginRegistry = mockPluginRegistry as unknown as InstallerPluginRegistry;

      return services;
    });
  });

  test("should include tool name in log messages when update succeeds", async () => {
    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: TOOL_NAME,
      version: "1.0.0",
      installPath: "/fake/install",
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: ["/fake/install/test-tool"],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    await program.parseAsync(["update", TOOL_NAME], { from: "user" });

    logger.expect(
      ["INFO"],
      ["registerUpdateCommand"],
      [],
      [messages.commandCheckingUpdatesFor(TOOL_NAME), messages.toolUpdated(TOOL_NAME, "1.0.0", "1.1.0")],
    );
  });

  test("should include tool name in log messages when tool is up-to-date", async () => {
    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: TOOL_NAME,
      version: "1.0.0",
      installPath: "/fake/install",
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: ["/fake/install/test-tool"],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    mockInstaller.install.mockImplementation(
      async (): Promise<InstallResult> => ({
        success: true,
        binaryPaths: ["/fake/bin/test-tool"],
        version: "1.0.0",
        originalTag: "v1.0.0",
        metadata: githubReleaseMetadata,
      }),
    );

    await program.parseAsync(["update", TOOL_NAME], { from: "user" });

    logger.expect(
      ["INFO"],
      ["registerUpdateCommand"],
      [],
      [messages.commandCheckingUpdatesFor(TOOL_NAME), messages.toolUpdated(TOOL_NAME, "1.0.0", "1.0.0")],
    );
  });
});
