import { Platform, type IInstallContext } from "@dotfiles/core";
import type { AptToolConfig } from "@dotfiles/installer-apt";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { AptInstallerPlugin } from "../AptInstallerPlugin";
import { createMockShell } from "./helpers/mocks";

describe("AptInstallerPlugin", () => {
  let plugin: AptInstallerPlugin;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    plugin = new AptInstallerPlugin(createMockShell());
  });

  it("has correct plugin metadata", () => {
    expect(plugin.method).toBe("apt");
    expect(plugin.displayName).toBe("APT Installer");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.externallyManaged).toBe(true);
    expect(plugin.supportsSudo?.()).toBe(true);
  });

  it("validates params with package, version, and update flag", () => {
    const result = plugin.paramsSchema.safeParse({
      package: "ripgrep",
      version: "13.0.0-1",
      update: true,
    });

    expect(result.success).toBe(true);
  });

  it("validates empty params", () => {
    const result = plugin.paramsSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("validates correct tool config", () => {
    const validConfig: AptToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      binaries: ["rg"],
      installationMethod: "apt",
      installParams: {
        package: "ripgrep",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects invalid installation method", () => {
    const invalidConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      binaries: ["rg"],
      installationMethod: "github-release",
      installParams: {
        package: "ripgrep",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("validates apt-get and dpkg-query on Linux", async () => {
    const shell = createMockShell();
    const validatingPlugin = new AptInstallerPlugin(shell);

    const result = await validatingPlugin.validate?.({ systemInfo: { platform: Platform.Linux } } as IInstallContext);

    assert(result);
    expect(result).toEqual({ valid: true });
  });

  it("rejects non-Linux platforms", async () => {
    const result = await plugin.validate?.({ systemInfo: { platform: Platform.MacOS } } as IInstallContext);

    assert(result);
    expect(result).toEqual({ valid: false, errors: ["APT installer only works on Linux"] });
  });

  it("installs using apt-get and returns installed metadata", async () => {
    const toolConfig: AptToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      binaries: ["rg"],
      installationMethod: "apt",
      installParams: {
        package: "ripgrep",
        version: "13.0.0-1",
        update: true,
      },
    };

    const result = await plugin.install("ripgrep", toolConfig, {} as IInstallContext, undefined, logger);

    assert(result.success);
    expect(result).toEqual({
      success: true,
      binaryPaths: ["/usr/bin/rg"],
      version: "13.0.0-1",
      metadata: {
        method: "apt",
        packageName: "ripgrep",
      },
    });
  });
});
