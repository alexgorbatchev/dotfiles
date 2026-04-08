import type { IInstallContext, ToolConfig } from "@dotfiles/core";
import type { IManualInstallSuccess } from "@dotfiles/installer-manual";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createInstallerTestSetup, type IInstallerTestSetup } from "./installer-test-helpers";

describe("Installer - Recursion Guard Edge Cases", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("should handle tool names with dots and other special characters", async () => {
    const toolName = "my.cool-tool@v2";
    // Expected: MY_COOL_TOOL_V2
    const envVarName = "DOTFILES_INSTALLING_MY_COOL_TOOL_V2";

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
    // We no longer modify process.env
  });
});
