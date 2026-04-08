import type { IAfterInstallContext, IInstallContext } from "@dotfiles/core";
import type { ManualToolConfig } from "@dotfiles/installer-manual";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import type { Installer } from "../Installer";
import { createInstallerTestSetup, createManualToolConfig, type IInstallerTestSetup } from "./installer-test-helpers";

/**
 * Tests that lifecycle hooks work correctly with the manual installer.
 *
 * The manual installer doesn't have download/extract phases, so only
 * before-install and after-install hooks are applicable.
 */
describe("Installer - Manual Installation Hooks", () => {
  let setup: IInstallerTestSetup;
  let installer: Installer;

  const mockToolName = "manual-test-tool";

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    installer = setup.installer;
  });

  describe("before-install hook", () => {
    it("should execute before-install hook for manual installations", async () => {
      const beforeInstallHook = mock(async (context: IInstallContext) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.fileSystem).toBeDefined();
        expect(context.stagingDir).toContain(mockToolName);
      });

      // Manual installation without binaryPath - just shell-only configuration
      const toolConfig: ManualToolConfig = createManualToolConfig({
        name: mockToolName,
        binaries: [mockToolName],
        installParams: {
          // No binaryPath - this is a config-only installation
          hooks: {
            "before-install": [beforeInstallHook],
          },
        },
      });

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(beforeInstallHook).toHaveBeenCalledTimes(1);
    });

    it("should fail installation if before-install hook fails", async () => {
      const errorMessage = "Pre-installation check failed";
      const beforeInstallHook = mock(async () => {
        assert.fail(errorMessage);
      });

      const toolConfig: ManualToolConfig = createManualToolConfig({
        name: mockToolName,
        binaries: [mockToolName],
        installParams: {
          hooks: {
            "before-install": [beforeInstallHook],
          },
        },
      });

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.error).toContain("beforeInstall hook failed");
      expect(result.error).toContain(errorMessage);
    });
  });

  describe("after-install hook", () => {
    it("should execute after-install hook for manual installations", async () => {
      const afterInstallHook = mock(async (context: IAfterInstallContext) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.fileSystem).toBeDefined();
        expect(context.installedDir).toBeDefined();
        expect(context.binaryPaths).toBeDefined();
      });

      const toolConfig: ManualToolConfig = createManualToolConfig({
        name: mockToolName,
        binaries: [mockToolName],
        installParams: {
          hooks: {
            "after-install": [afterInstallHook],
          },
        },
      });

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(afterInstallHook).toHaveBeenCalledTimes(1);
    });

    it("should continue installation if after-install hook fails (continueOnError=true)", async () => {
      const afterInstallHook = mock(async () => {
        assert.fail("Post-installation cleanup failed");
      });

      const toolConfig: ManualToolConfig = createManualToolConfig({
        name: mockToolName,
        binaries: [mockToolName],
        installParams: {
          hooks: {
            "after-install": [afterInstallHook],
          },
        },
      });

      const result = await installer.install(mockToolName, toolConfig);

      // Installation should still succeed despite after-install hook failure
      expect(result.success).toBe(true);
      expect(afterInstallHook).toHaveBeenCalledTimes(1);
    });
  });

  describe("combined hooks", () => {
    it("should execute both before-install and after-install hooks in order", async () => {
      const callOrder: string[] = [];

      const beforeInstallHook = mock(async () => {
        callOrder.push("before-install");
      });

      const afterInstallHook = mock(async () => {
        callOrder.push("after-install");
      });

      const toolConfig: ManualToolConfig = createManualToolConfig({
        name: mockToolName,
        binaries: [mockToolName],
        installParams: {
          hooks: {
            "before-install": [beforeInstallHook],
            "after-install": [afterInstallHook],
          },
        },
      });

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(callOrder).toEqual(["before-install", "after-install"]);
    });
  });

  describe("hook context properties", () => {
    it("should provide $ (shell) in hook context", async () => {
      let shellAvailable = false;

      const beforeInstallHook = mock(async (context: IInstallContext) => {
        shellAvailable = typeof context.$ === "function";
      });

      const toolConfig: ManualToolConfig = createManualToolConfig({
        name: mockToolName,
        binaries: [mockToolName],
        installParams: {
          hooks: {
            "before-install": [beforeInstallHook],
          },
        },
      });

      await installer.install(mockToolName, toolConfig);

      expect(shellAvailable).toBe(true);
    });
  });
});
