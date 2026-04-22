import type { IInstallContext, IUpdateCheckContext } from "@dotfiles/core";
import type { NpmToolConfig } from "@dotfiles/installer-npm";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { NpmInstallerPlugin } from "../NpmInstallerPlugin";
import { createMockShell } from "./helpers/mocks";

describe("NpmInstallerPlugin", () => {
  let plugin: NpmInstallerPlugin;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    plugin = new NpmInstallerPlugin(createMockShell());
  });

  it("should have correct plugin metadata", () => {
    expect(plugin.method).toBe("npm");
    expect(plugin.displayName).toBe("npm Installer");
    expect(plugin.version).toBe("1.0.0");
  });

  it("should have valid schemas", () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it("should validate correct params", () => {
    const validParams = {
      package: "prettier",
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("should validate params with version", () => {
    const validParams = {
      package: "prettier",
      version: "3.0.0",
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("should validate empty params", () => {
    const validParams = {};

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("should accept packageManager bun", () => {
    const result = plugin.paramsSchema.safeParse({ package: "prettier", packageManager: "bun" });
    expect(result.success).toBe(true);
  });

  it("should accept packageManager npm", () => {
    const result = plugin.paramsSchema.safeParse({ package: "prettier", packageManager: "npm" });
    expect(result.success).toBe(true);
  });

  it("should reject invalid packageManager values", () => {
    const result = plugin.paramsSchema.safeParse({ package: "prettier", packageManager: "yarn" });
    expect(result.success).toBe(false);
  });

  it("should validate correct tool config", () => {
    const validConfig: NpmToolConfig = {
      name: "prettier",
      version: "3.0.0",
      binaries: ["prettier"],
      installationMethod: "npm",
      installParams: {
        package: "prettier",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("should reject invalid installation method", () => {
    const invalidConfig = {
      name: "prettier",
      version: "3.0.0",
      binaries: ["prettier"],
      installationMethod: "github-release",
      installParams: {
        package: "prettier",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("should support updates", () => {
    expect(plugin.supportsUpdate()).toBe(true);
  });

  it("should support update checks", () => {
    expect(plugin.supportsUpdateCheck()).toBe(true);
  });

  it("should not support readme", () => {
    expect(plugin.supportsReadme()).toBe(false);
  });

  describe("resolveVersion", () => {
    const mockContext = {} as IInstallContext;

    it("should resolve version from npm view", async () => {
      const toolConfig: NpmToolConfig = {
        name: "prettier",
        version: "latest",
        binaries: ["prettier"],
        installationMethod: "npm",
        installParams: {
          package: "prettier",
        },
      };

      const version: string | null = await plugin.resolveVersion(
        "prettier",
        toolConfig,
        mockContext,
        undefined,
        logger,
      );

      expect(version).toBe("3.1.0");
    });

    it("should use tool name when package is not specified", async () => {
      const toolConfig: NpmToolConfig = {
        name: "prettier",
        version: "latest",
        binaries: ["prettier"],
        installationMethod: "npm",
        installParams: {},
      };

      const version: string | null = await plugin.resolveVersion(
        "prettier",
        toolConfig,
        mockContext,
        undefined,
        logger,
      );

      expect(version).toBe("3.1.0");
    });

    it("should return null when npm view returns empty output", async () => {
      const emptyShell = createMockShell(() => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        code: 0,
        toString: () => "",
      }));
      const emptyPlugin = new NpmInstallerPlugin(emptyShell);

      const toolConfig: NpmToolConfig = {
        name: "nonexistent",
        version: "latest",
        binaries: ["nonexistent"],
        installationMethod: "npm",
        installParams: {
          package: "nonexistent",
        },
      };

      const version: string | null = await emptyPlugin.resolveVersion(
        "nonexistent",
        toolConfig,
        mockContext,
        undefined,
        logger,
      );

      expect(version).toBeNull();
    });

    it("should normalize version by stripping v prefix", async () => {
      const vPrefixShell = createMockShell(() => ({
        stdout: "v2.5.0",
        stderr: "",
        exitCode: 0,
        code: 0,
        toString: () => "v2.5.0",
      }));
      const vPrefixPlugin = new NpmInstallerPlugin(vPrefixShell);

      const toolConfig: NpmToolConfig = {
        name: "some-tool",
        version: "latest",
        binaries: ["some-tool"],
        installationMethod: "npm",
        installParams: {
          package: "some-tool",
        },
      };

      const version: string | null = await vPrefixPlugin.resolveVersion(
        "some-tool",
        toolConfig,
        mockContext,
        undefined,
        logger,
      );

      expect(version).toBe("2.5.0");
    });
  });

  describe("checkUpdate", () => {
    let mockContext: IUpdateCheckContext;

    beforeEach(() => {
      mockContext = {};
    });

    it("should return configured latest version when configured version is latest", async () => {
      const toolConfig: NpmToolConfig = {
        name: "prettier",
        version: "latest",
        binaries: ["prettier"],
        installationMethod: "npm",
        installParams: {
          package: "prettier",
        },
      };

      const result = await plugin.checkUpdate("prettier", toolConfig, mockContext, logger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
      expect(result.currentVersion).toBe("latest");
      expect(result.latestVersion).toBe("3.1.0");
    });

    it("should compare installed version for latest-tracking tools", async () => {
      const toolConfig: NpmToolConfig = {
        name: "prettier",
        version: "latest",
        binaries: ["prettier"],
        installationMethod: "npm",
        installParams: {
          package: "prettier",
        },
      };

      mockContext = { installedVersion: "v2.0.0" };

      const result = await plugin.checkUpdate("prettier", toolConfig, mockContext, logger);

      assert(result.success);
      expect(result.hasUpdate).toBe(true);
      expect(result.currentVersion).toBe("2.0.0");
      expect(result.latestVersion).toBe("3.1.0");
    });

    it("should return no update when configured version matches latest", async () => {
      const toolConfig: NpmToolConfig = {
        name: "prettier",
        version: "3.1.0",
        binaries: ["prettier"],
        installationMethod: "npm",
        installParams: {
          package: "prettier",
        },
      };

      const result = await plugin.checkUpdate("prettier", toolConfig, mockContext, logger);

      assert(result.success);
      expect(result.hasUpdate).toBe(false);
      expect(result.currentVersion).toBe("3.1.0");
      expect(result.latestVersion).toBe("3.1.0");
    });

    it("should detect available update when versions differ", async () => {
      const toolConfig: NpmToolConfig = {
        name: "prettier",
        version: "2.0.0",
        binaries: ["prettier"],
        installationMethod: "npm",
        installParams: {
          package: "prettier",
        },
      };

      const result = await plugin.checkUpdate("prettier", toolConfig, mockContext, logger);

      assert(result.success);
      expect(result.hasUpdate).toBe(true);
      expect(result.currentVersion).toBe("2.0.0");
      expect(result.latestVersion).toBe("3.1.0");
    });

    it("should return failure when npm view returns empty version", async () => {
      const emptyShell = createMockShell(() => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        code: 0,
        toString: () => "",
      }));
      const emptyPlugin = new NpmInstallerPlugin(emptyShell);

      const toolConfig: NpmToolConfig = {
        name: "nonexistent",
        version: "1.0.0",
        binaries: ["nonexistent"],
        installationMethod: "npm",
        installParams: {
          package: "nonexistent",
        },
      };

      const result = await emptyPlugin.checkUpdate("nonexistent", toolConfig, mockContext, logger);

      assert(!result.success);
      expect(result.error).toBe("Could not fetch latest version for npm package: nonexistent");
    });
  });
});
