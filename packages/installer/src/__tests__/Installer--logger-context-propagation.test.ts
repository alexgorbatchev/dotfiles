/**
 * Integration tests for logger context propagation.
 *
 * Verifies that tool name context flows correctly through all services during installation:
 * - Installer creates logger with { context: toolName }
 * - HookExecutor receives logger with tool context
 * - InstallerPluginRegistry receives logger with tool context
 *
 * This ensures log messages include the tool name for easier debugging.
 */
import type { IInstallContext } from "@dotfiles/core";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  type IInstallerTestSetup,
  MOCK_TOOL_NAME,
} from "./installer-test-helpers";

describe("Installer - Logger Context Propagation", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    // Create the mock binary file so symlink creation succeeds
    await setup.fs.ensureDir(path.dirname(setup.mockToolBinaryPath));
    await setup.fs.writeFile(setup.mockToolBinaryPath, "mock binary content");
    await setup.fs.chmod(setup.mockToolBinaryPath, 0o755);
  });

  it("should propagate tool context through all installation phases (DEBUG level)", async () => {
    let capturedContext: IInstallContext | undefined;

    const beforeInstallHook = mock((ctx: IInstallContext) => {
      capturedContext = ctx;
      return Promise.resolve();
    });
    const afterDownloadHook = mock(() => Promise.resolve());
    const afterExtractHook = mock(() => Promise.resolve());
    const afterInstallHook = mock(() => Promise.resolve());

    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: "owner/repo",
        hooks: {
          "before-install": [beforeInstallHook],
          "after-download": [afterDownloadHook],
          "after-extract": [afterExtractHook],
          "after-install": [afterInstallHook],
        },
      },
    });

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Verify installation succeeded
    expect(result.success).toBe(true);

    // Verify all hooks were called
    expect(beforeInstallHook).toHaveBeenCalled();
    expect(afterDownloadHook).toHaveBeenCalled();
    expect(afterExtractHook).toHaveBeenCalled();
    expect(afterInstallHook).toHaveBeenCalled();

    // Verify context.toolName is correctly set in hook context
    expect(capturedContext).toBeDefined();
    expect(capturedContext?.toolName).toBe(MOCK_TOOL_NAME);

    // Verify tool context [test-tool] prefix appears in logs from each service:
    // - Installer.install
    setup.logger.expect(["DEBUG"], ["Installer", "install"], [MOCK_TOOL_NAME], []);
    // - HookExecutor
    setup.logger.expect(["DEBUG"], ["HookExecutor", "executeHooks"], [MOCK_TOOL_NAME], []);
    // - createBinaryEntrypoints
    setup.logger.expect(["DEBUG"], ["Installer", "install", "createBinaryEntrypoints"], [MOCK_TOOL_NAME], []);
  });

  it("should include tool context in ERROR level logs when hook fails", async () => {
    const failingHook = mock(() => Promise.reject(new Error("Hook execution failed")));

    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: "owner/repo",
        hooks: {
          "before-install": [failingHook],
        },
      },
    });

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Installation should fail due to hook error
    expect(result.success).toBe(false);
    expect(failingHook).toHaveBeenCalled();

    // Verify ERROR log includes tool context
    // Full path: Installer > install > createBaseInstallContext > install-{toolName} > executeBeforeInstallHook > HookExecutor > executeHook
    setup.logger.expect(
      ["ERROR"],
      [
        "Installer",
        "install",
        "createBaseInstallContext",
        `install-${MOCK_TOOL_NAME}`,
        "executeBeforeInstallHook",
        "HookExecutor",
        "executeHook",
      ],
      [MOCK_TOOL_NAME],
      ["Hook failed"],
    );
  });

  // Note: When registry.install throws, the error is caught by an inner try-catch
  // and converted to a result object without ERROR logging. Only unexpected
  // exceptions in the outer try block produce ERROR logs.
});
