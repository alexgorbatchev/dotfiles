import { Platform, type IInstallContext } from "@dotfiles/core";
import type { PacmanToolConfig } from "@dotfiles/installer-pacman";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { PacmanInstallerPlugin } from "../PacmanInstallerPlugin";
import { createMockShell } from "./helpers/mocks";

describe("PacmanInstallerPlugin", () => {
  let plugin: PacmanInstallerPlugin;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    plugin = new PacmanInstallerPlugin(createMockShell());
  });

  it("has correct plugin metadata", () => {
    expect(plugin.method).toBe("pacman");
    expect(plugin.displayName).toBe("pacman Installer");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.externallyManaged).toBe(true);
    expect(plugin.supportsSudo?.()).toBe(true);
  });

  it("validates params with package, version, and sysupgrade flag", () => {
    const result = plugin.paramsSchema.safeParse({
      package: "ripgrep",
      version: "13.0.0-1",
      sysupgrade: true,
    });

    expect(result.success).toBe(true);
  });

  it("validates empty params", () => {
    const result = plugin.paramsSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("validates correct tool config", () => {
    const validConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      binaries: ["rg"],
      installationMethod: "pacman",
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

  it("validates pacman on Linux", async () => {
    const shell = createMockShell();
    const validatingPlugin = new PacmanInstallerPlugin(shell);

    const result = await validatingPlugin.validate?.({ systemInfo: { platform: Platform.Linux } } as IInstallContext);

    assert(result);
    expect(result).toEqual({ valid: true });
  });

  it("rejects non-Linux platforms", async () => {
    const result = await plugin.validate?.({ systemInfo: { platform: Platform.MacOS } } as IInstallContext);

    assert(result);
    expect(result).toEqual({ valid: false, errors: ["pacman installer only works on Linux"] });
  });

  it("installs using pacman and returns installed metadata", async () => {
    const toolConfig: PacmanToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1",
      binaries: ["rg"],
      installationMethod: "pacman",
      installParams: {
        package: "ripgrep",
        version: "13.0.0-1",
        sysupgrade: true,
      },
    };

    const result = await plugin.install("ripgrep", toolConfig, {} as IInstallContext, undefined, logger);

    assert(result.success);
    expect(result).toEqual({
      success: true,
      binaryPaths: ["/usr/bin/rg"],
      version: "13.0.0-1",
      metadata: {
        method: "pacman",
        packageName: "ripgrep",
      },
    });
  });
});
