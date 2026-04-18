import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { createShell, Platform } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import type { PkgToolConfig } from "@dotfiles/installer-pkg";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { PkgInstallerPlugin } from "../PkgInstallerPlugin";
import { ALLOW_NON_MACOS_ENV_VAR, INSTALLER_PATH_ENV_VAR } from "../installerPath";

const shell = createShell();

describe("PkgInstallerPlugin", () => {
  let plugin: PkgInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockHookExecutor: HookExecutor;
  let mockGitHubApiClient: IGitHubApiClient;

  beforeEach(() => {
    delete process.env[ALLOW_NON_MACOS_ENV_VAR];
    delete process.env[INSTALLER_PATH_ENV_VAR];
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockHookExecutor = {} as HookExecutor;
    mockGitHubApiClient = {} as IGitHubApiClient;

    plugin = new PkgInstallerPlugin(
      mockFs,
      mockDownloader,
      mockArchiveExtractor,
      mockHookExecutor,
      shell,
      mockGitHubApiClient,
      undefined,
    );
  });

  afterEach(() => {
    delete process.env[ALLOW_NON_MACOS_ENV_VAR];
    delete process.env[INSTALLER_PATH_ENV_VAR];
  });

  it("should have correct plugin metadata", () => {
    expect(plugin.method).toBe("pkg");
    expect(plugin.displayName).toBe("PKG Installer");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.externallyManaged).toBe(true);
    expect(plugin.missingBinaryMessage).toContain("macOS Installer");
    expect(plugin.supportsSudo?.()).toBe(true);
  });

  it("should validate correct params", () => {
    const result = plugin.paramsSchema.safeParse({
      source: {
        type: "url",
        url: "https://example.com/tool.pkg",
      },
    });

    expect(result.success).toBe(true);
  });

  it("should validate correct tool config", () => {
    const validConfig: PkgToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      sudo: true,
      binaries: ["test-tool"],
      installationMethod: "pkg",
      installParams: {
        source: {
          type: "url",
          url: "https://example.com/tool.pkg",
        },
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  describe("validate", () => {
    it("should return valid with warning on non-macOS", async () => {
      const context = {
        systemInfo: { platform: Platform.Linux },
      } as never;

      const result = await plugin.validate(context);
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual(["PKG installer only works on macOS"]);
    });

    it("should validate on non-macOS when test override is enabled", async () => {
      process.env[ALLOW_NON_MACOS_ENV_VAR] = "1";
      const mockShell = mock(() => ({
        quiet: mock(() => Promise.resolve()),
      }));
      const pluginWithOverride = new PkgInstallerPlugin(
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        mockShell as unknown as ReturnType<typeof createShell>,
        mockGitHubApiClient,
        undefined,
      );

      const result = await pluginWithOverride.validate({ systemInfo: { platform: Platform.Linux } } as never);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
      expect(mockShell).toHaveBeenCalledTimes(1);
    });

    it("should return valid on macOS when installer exists", async () => {
      const mockShell = mock(() => ({
        quiet: mock(() => Promise.resolve()),
      }));
      const macPlugin = new PkgInstallerPlugin(
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        mockShell as unknown as ReturnType<typeof createShell>,
        mockGitHubApiClient,
        undefined,
      );

      const result = await macPlugin.validate({ systemInfo: { platform: Platform.MacOS } } as never);
      expect(result.valid).toBe(true);
      expect(mockShell).toHaveBeenCalledTimes(1);
    });

    it("should use override installer path when configured", async () => {
      process.env[INSTALLER_PATH_ENV_VAR] = "/tmp/fake-installer";
      const mockShell = mock(() => ({
        quiet: mock(() => Promise.resolve()),
      }));
      const macPlugin = new PkgInstallerPlugin(
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        mockShell as unknown as ReturnType<typeof createShell>,
        mockGitHubApiClient,
        undefined,
      );

      const result = await macPlugin.validate({ systemInfo: { platform: Platform.MacOS } } as never);
      expect(result.valid).toBe(true);
      const firstCall = mockShell.mock.calls[0] as unknown[] | undefined;
      expect(firstCall).toBeDefined();
      expect(firstCall?.[1]).toBe("/tmp/fake-installer");
    });

    it("should return invalid on macOS when installer is missing", async () => {
      const mockShell = mock(() => ({
        quiet: mock(() => Promise.reject(new Error("not found"))),
      }));
      const macPlugin = new PkgInstallerPlugin(
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        mockShell as unknown as ReturnType<typeof createShell>,
        mockGitHubApiClient,
        undefined,
      );

      const result = await macPlugin.validate({ systemInfo: { platform: Platform.MacOS } } as never);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(["installer not found — required for PKG installation"]);
    });
  });
});
