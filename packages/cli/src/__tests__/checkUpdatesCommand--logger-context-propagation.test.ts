/**
 * Integration tests for logger context propagation in the check-updates command.
 *
 * Verifies that tool name context flows through log messages when checking for updates.
 */
import type { IConfigService } from "@dotfiles/config";
import type { IInstallerPlugin, InstallerPluginRegistry, UpdateCheckResult } from "@dotfiles/core";
import type { GithubReleaseToolConfig } from "@dotfiles/installer-github";
import type { TestLogger } from "@dotfiles/logger";
import type { MockedInterface } from "@dotfiles/testing-helpers";
import { VersionComparisonStatus } from "@dotfiles/version-checker";
import { beforeEach, describe, mock, test } from "bun:test";
import { registerCheckUpdatesCommand } from "../checkUpdatesCommand";
import { messages } from "../log-messages";
import type { IGlobalProgram } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

describe("checkUpdatesCommand - Logger Context Propagation", () => {
  let program: IGlobalProgram;
  let mockPlugin: Partial<IInstallerPlugin>;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const TOOL_NAME = "test-tool";

  const toolConfig: GithubReleaseToolConfig = {
    name: TOOL_NAME,
    version: "1.0.0",
    installationMethod: "github-release",
    installParams: { repo: "owner/test-tool" },
    binaries: ["test-tool"],
  };

  beforeEach(async () => {
    mockConfigService = {
      loadSingleToolConfig: mock(async () => toolConfig),
      loadToolConfigs: mock(async () => ({})),
      loadToolConfigByBinary: mock(async () => undefined),
    };

    mockPlugin = {
      supportsUpdateCheck: mock(() => true),
      checkUpdate: mock(
        async (): Promise<UpdateCheckResult> => ({
          success: true,
          hasUpdate: true,
          currentVersion: "1.0.0",
          latestVersion: "1.1.0",
        }),
      ),
    };

    const mockPluginRegistry: Partial<MockedInterface<InstallerPluginRegistry>> = {
      get: mock((method: string) =>
        new Map<string, IInstallerPlugin>([["github-release", mockPlugin as IInstallerPlugin]]).get(method),
      ),
      register: mock(() => Promise.resolve()),
      getAll: mock(() => []),
    };

    const setup = await createCliTestSetup({
      testName: "check-updates-context",
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        pluginRegistry: mockPluginRegistry as MockedInterface<InstallerPluginRegistry>,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
          getLatestToolVersion: mock(async () => "1.0.0"),
        },
      },
    });

    program = setup.program;
    logger = setup.logger;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test("should include tool name in log messages when update is available", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: true,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
    });

    await program.parseAsync(["check-updates", TOOL_NAME], { from: "user" });

    logger.expect(
      ["INFO"],
      ["registerCheckUpdatesCommand"],
      [],
      [messages.toolUpdateAvailable(TOOL_NAME, "1.0.0", "1.1.0")],
    );
  });

  test("should include tool name in log messages when tool is up-to-date", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
    });

    await program.parseAsync(["check-updates", TOOL_NAME], { from: "user" });

    logger.expect(["INFO"], ["registerCheckUpdatesCommand"], [], [messages.toolUpToDate(TOOL_NAME, "1.0.0", "1.0.0")]);
  });

  test("should include each tool name in log messages when checking all tools", async () => {
    const secondToolConfig: GithubReleaseToolConfig = {
      name: "second-tool",
      version: "2.0.0",
      installationMethod: "github-release",
      installParams: { repo: "owner/second-tool" },
      binaries: ["second-tool"],
    };

    mockConfigService.loadToolConfigs.mockResolvedValue({
      [TOOL_NAME]: toolConfig,
      "second-tool": secondToolConfig,
    });

    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
    });

    await program.parseAsync(["check-updates"], { from: "user" });

    // Verify both tool names appear in log messages
    logger.expect(
      ["INFO"],
      ["registerCheckUpdatesCommand"],
      [],
      [messages.toolUpToDate(TOOL_NAME, "1.0.0", "1.0.0"), messages.toolUpToDate("second-tool", "1.0.0", "1.0.0")],
    );
  });
});
