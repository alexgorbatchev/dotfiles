import type { IFileSystem } from "@dotfiles/file-system";
import type { ManualToolConfig } from "@dotfiles/installer-manual";
import { beforeEach, describe, expect, it } from "bun:test";
import { ManualInstallerPlugin } from "../ManualInstallerPlugin";

describe("ManualInstallerPlugin", () => {
  let plugin: ManualInstallerPlugin;
  let mockFs: IFileSystem;

  beforeEach(() => {
    mockFs = {} as IFileSystem;

    plugin = new ManualInstallerPlugin(mockFs);
  });

  it("should have correct plugin metadata", () => {
    expect(plugin.method).toBe("manual");
    expect(plugin.displayName).toBe("Manual Installer");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.supportsSudo?.()).toBe(true);
  });

  it("should have valid schemas", () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it("should validate correct params", () => {
    const validParams = {};

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("should validate correct tool config", () => {
    const validConfig: ManualToolConfig = {
      name: "test-tool",
      version: "1.0.0",
      sudo: true,
      binaries: ["test-tool"],
      installationMethod: "manual",
      installParams: {},
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });
});
