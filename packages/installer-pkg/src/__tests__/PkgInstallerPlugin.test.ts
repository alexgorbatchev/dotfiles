import type { IArchiveExtractor } from "@dotfiles/archive-extractor";
import { createShell, Platform } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IFileSystem } from "@dotfiles/file-system";
import type { HookExecutor } from "@dotfiles/installer";
import type { IGitHubApiClient } from "@dotfiles/installer-github";
import type { PkgToolConfig } from "@dotfiles/installer-pkg";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PkgInstallerPlugin } from "../PkgInstallerPlugin";

const shell = createShell();

describe("PkgInstallerPlugin", () => {
  let plugin: PkgInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockHookExecutor: HookExecutor;
  let mockGitHubApiClient: IGitHubApiClient;

  beforeEach(() => {
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

  it("should have correct plugin metadata", () => {
    expect(plugin.method).toBe("pkg");
    expect(plugin.displayName).toBe("PKG Installer");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.externallyManaged).toBe(true);
    expect(plugin.missingBinaryMessage).toContain("macOS Installer");
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
