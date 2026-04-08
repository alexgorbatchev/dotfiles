import type { IConfigService } from "@dotfiles/config";
import type { IInstallerPlugin, InstallerPluginRegistry, UpdateCheckResult } from "@dotfiles/core";
import type { CargoToolConfig } from "@dotfiles/installer-cargo";
import type { TestLogger } from "@dotfiles/logger";
import type { MockedInterface } from "@dotfiles/testing-helpers";
import { VersionComparisonStatus } from "@dotfiles/version-checker";
import { beforeEach, describe, mock, test } from "bun:test";
import { registerCheckUpdatesCommand } from "../checkUpdatesCommand";
import { messages } from "../log-messages";
import type { IGlobalProgram } from "../types";
import { createCliTestSetup } from "./createCliTestSetup";

describe("checkUpdatesCommand - Cargo Updates", () => {
  let program: IGlobalProgram;
  let mockPlugin: Partial<IInstallerPlugin>;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const cargoToolConfig: CargoToolConfig = {
    name: "exa",
    version: "0.10.1",
    installationMethod: "cargo",
    installParams: { crateName: "exa" },
    binaries: ["exa"],
  };

  beforeEach(async () => {
    // Create a configService mock that we can control
    mockConfigService = {
      loadSingleToolConfig: mock(async () => cargoToolConfig),
      loadToolConfigs: mock(async () => ({})),
      loadToolConfigByBinary: mock(async () => undefined),
    };

    // Create mock plugin that implements checkUpdate capability
    mockPlugin = {
      supportsUpdateCheck: mock(() => true),
      checkUpdate: mock(
        async (): Promise<UpdateCheckResult> => ({
          success: true,
          hasUpdate: false,
          currentVersion: "0.10.1",
          latestVersion: "0.10.1",
        }),
      ),
    };

    const mockPluginRegistry: Partial<MockedInterface<InstallerPluginRegistry>> = {
      get: mock((method: string) =>
        new Map<string, IInstallerPlugin>([["cargo", mockPlugin as IInstallerPlugin]]).get(method),
      ),
      register: mock(() => Promise.resolve()),
      getAll: mock(() => []),
    };

    const setup = await createCliTestSetup({
      testName: "check-updates-cargo",
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        pluginRegistry: mockPluginRegistry as MockedInterface<InstallerPluginRegistry>,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
          getLatestToolVersion: mock(async () => "0.10.1"),
        },
      },
    });
    program = setup.program;
    logger = setup.logger;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test("should report cargo crate is up-to-date", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: "0.10.1",
      latestVersion: "0.10.1",
    });

    await program.parseAsync(["check-updates", "exa"], { from: "user" });

    logger.expect(["INFO"], ["registerCheckUpdatesCommand"], [], [messages.toolUpToDate("exa", "0.10.1", "0.10.1")]);
  });

  test("should report cargo crate update available", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: true,
      currentVersion: "0.10.1",
      latestVersion: "0.11.0",
    });

    await program.parseAsync(["check-updates", "exa"], { from: "user" });

    logger.expect(
      ["INFO"],
      ["registerCheckUpdatesCommand"],
      [],
      [messages.toolUpdateAvailable("exa", "0.10.1", "0.11.0")],
    );
  });

  test('should handle cargo tool configured with "latest" version', async () => {
    const cargoLatestConfig: CargoToolConfig = { ...cargoToolConfig, version: "latest" };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoLatestConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: "latest",
      latestVersion: "0.12.0",
    });

    await program.parseAsync(["check-updates", "exa"], { from: "user" });

    logger.expect(["INFO"], ["registerCheckUpdatesCommand"], [], [messages.toolConfiguredToLatest("exa", "0.12.0")]);
  });

  test("should handle missing crateName in cargo tool config", async () => {
    const missingCrateConfig = {
      ...cargoToolConfig,
      installParams: {},
    } as CargoToolConfig;
    mockConfigService.loadSingleToolConfig.mockResolvedValue(missingCrateConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: false,
      error: "Invalid crateName: undefined",
    });

    await program.parseAsync(["check-updates", "exa"], { from: "user" });

    logger.expect(["ERROR"], ["registerCheckUpdatesCommand"], [], [messages.serviceGithubApiFailed("check update", 0)]);
  });

  test("should handle cargo client error gracefully", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: false,
      error: "Cargo API Down",
    });

    await program.parseAsync(["check-updates", "exa"], { from: "user" });

    logger.expect(["ERROR"], ["registerCheckUpdatesCommand"], [], [messages.serviceGithubApiFailed("check update", 0)]);
  });

  test("should handle cargo API returning null version", async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: false,
      error: "Could not retrieve version",
    });

    await program.parseAsync(["check-updates", "exa"], { from: "user" });

    logger.expect(["ERROR"], ["registerCheckUpdatesCommand"], [], [messages.serviceGithubApiFailed("check update", 0)]);
  });
});
