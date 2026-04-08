import type { IInstallContext, ToolConfig } from "@dotfiles/core";
import type { IManualInstallSuccess } from "@dotfiles/installer-manual";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import assert from "node:assert";
import { createInstallerTestSetup, type IInstallerTestSetup } from "./installer-test-helpers";

describe("Installer - Recursion Guard", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("should set the recursion guard environment variable in shell during installation", async () => {
    const toolName = "my-test-tool";
    const envVarName = "DOTFILES_INSTALLING_MY_TEST_TOOL";

    const toolConfig: ToolConfig = {
      name: toolName,
      version: "1.0.0",
      installationMethod: "mock-method",
      installParams: {},
    } as unknown as ToolConfig;

    let envVarSeenByShell: string | undefined;

    // Mock plugin that captures the environment variable state via shell
    const installSpy = spyOn(setup.pluginRegistry, "install").mockImplementation(
      async (_logger, _method, _name, _config, context: IInstallContext) => {
        // Check the shell environment - this is what shimmed binaries will see
        const result = await context.$`printenv ${envVarName} || true`.quiet();
        envVarSeenByShell = result.stdout.trim() || undefined;
        return {
          success: true,
          binaryPaths: ["/fake/path"],
          version: "1.0.0",
          metadata: { method: "manual", manualInstall: true },
        } as IManualInstallSuccess;
      },
    );

    // Execute installation
    await setup.installer.install(toolName, toolConfig);

    // Verify the env var was visible to shell commands
    expect(envVarSeenByShell).toBe("true");

    // We no longer modify process.env, so no cleanup assertion needed.
    // The env var is scoped to the shell environment passed to the context.

    // Verify the plugin was actually called
    expect(installSpy).toHaveBeenCalled();
  });

  it("should handle tool names with hyphens correctly", async () => {
    const toolName = "complex-tool-name-v2";
    const envVarName = "DOTFILES_INSTALLING_COMPLEX_TOOL_NAME_V2";

    const toolConfig: ToolConfig = {
      name: toolName,
      version: "1.0.0",
      installationMethod: "mock-method",
      installParams: {},
    } as unknown as ToolConfig;

    let envVarSeenByShell: string | undefined;

    spyOn(setup.pluginRegistry, "install").mockImplementation(
      async (_logger, _method, _name, _config, context: IInstallContext) => {
        const result = await context.$`printenv ${envVarName} || true`.quiet();
        envVarSeenByShell = result.stdout.trim() || undefined;
        return {
          success: true,
          binaryPaths: ["/fake/path"],
          version: "1.0.0",
          metadata: { method: "manual", manualInstall: true },
        } as IManualInstallSuccess;
      },
    );

    await setup.installer.install(toolName, toolConfig);

    expect(envVarSeenByShell).toBe("true");
  });

  it("should not leak recursion guard to process.env even if installation fails", async () => {
    const toolName = "failing-tool";
    const envVarName = "DOTFILES_INSTALLING_FAILING_TOOL";

    const toolConfig: ToolConfig = {
      name: toolName,
      version: "1.0.0",
      installationMethod: "mock-method",
      installParams: {},
    } as unknown as ToolConfig;

    spyOn(setup.pluginRegistry, "install").mockImplementation(async () => {
      assert.fail("Installation failed");
    });

    // Execute installation (which will fail)
    await setup.installer.install(toolName, toolConfig);

    // Verify process.env was never polluted (since we don't modify it)
    expect(process.env[envVarName]).toBeUndefined();
  });
});
