import { Platform, type IInstallContext } from "@dotfiles/core";
import type { DnfToolConfig } from "@dotfiles/installer-dnf";
import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { DnfInstallerPlugin } from "../DnfInstallerPlugin";
import { createMockShell } from "./helpers/mocks";

describe("DnfInstallerPlugin", () => {
  let plugin: DnfInstallerPlugin;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    plugin = new DnfInstallerPlugin(createMockShell());
  });

  it("has correct plugin metadata", () => {
    expect(plugin.method).toBe("dnf");
    expect(plugin.displayName).toBe("DNF Installer");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.externallyManaged).toBe(true);
    expect(plugin.supportsSudo?.()).toBe(true);
  });

  it("validates params with package, version, and refresh flag", () => {
    const result = plugin.paramsSchema.safeParse({
      package: "ripgrep",
      version: "13.0.0-1.fc40",
      refresh: true,
    });

    expect(result.success).toBe(true);
  });

  it("validates empty params", () => {
    const result = plugin.paramsSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("validates correct tool config", () => {
    const validConfig: DnfToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1.fc40",
      binaries: ["rg"],
      installationMethod: "dnf",
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
      version: "13.0.0-1.fc40",
      binaries: ["rg"],
      installationMethod: "github-release",
      installParams: {
        package: "ripgrep",
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("validates dnf and rpm on Linux", async () => {
    const shell = createMockShell();
    const validatingPlugin = new DnfInstallerPlugin(shell);

    const result = await validatingPlugin.validate?.({ systemInfo: { platform: Platform.Linux } } as IInstallContext);

    assert(result);
    expect(result).toEqual({ valid: true });
  });

  it("rejects non-Linux platforms", async () => {
    const result = await plugin.validate?.({ systemInfo: { platform: Platform.MacOS } } as IInstallContext);

    assert(result);
    expect(result).toEqual({ valid: false, errors: ["DNF installer only works on Linux"] });
  });

  it("installs using dnf and returns installed metadata", async () => {
    const toolConfig: DnfToolConfig = {
      name: "ripgrep",
      version: "13.0.0-1.fc40",
      binaries: ["rg"],
      installationMethod: "dnf",
      installParams: {
        package: "ripgrep",
        version: "13.0.0-1.fc40",
        refresh: true,
      },
    };

    const result = await plugin.install("ripgrep", toolConfig, {} as IInstallContext, undefined, logger);

    assert(result.success);
    expect(result).toEqual({
      success: true,
      binaryPaths: ["/usr/bin/rg"],
      version: "13.0.0-1.fc40",
      metadata: {
        method: "dnf",
        packageName: "ripgrep",
      },
    });
  });

  it("records the configured exact version for epoch-qualified installs", async () => {
    const toolConfig: DnfToolConfig = {
      name: "ripgrep",
      version: "latest",
      binaries: ["rg"],
      installationMethod: "dnf",
      installParams: {
        package: "ripgrep",
        version: "1:13.0.0-1.fc40",
      },
    };

    const result = await plugin.install("ripgrep", toolConfig, {} as IInstallContext, undefined, logger);

    assert(result.success);
    expect(result.version).toBe("1-13.0.0-1.fc40");
  });
});
