import type { IAfterInstallContext } from "@dotfiles/core";
import type { GithubReleaseToolConfig } from "@dotfiles/installer-github";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { createInstallerTestSetup, type IInstallerTestSetup, setupFileSystemMocks } from "./installer-test-helpers";

describe("AfterInstallContext shape", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    setupFileSystemMocks(setup);
  });

  it("does not include binaryPath (use binaryPaths[0])", async () => {
    let didRunHook: boolean = false;
    let hasBinaryPathProperty: boolean = true;

    const toolConfig: GithubReleaseToolConfig = {
      name: "example-tool",
      binaries: ["tool"],
      version: "latest",
      installationMethod: "github-release",
      installParams: {
        repo: "example/tool",
        hooks: {
          "after-install": [
            async (context: IAfterInstallContext): Promise<void> => {
              didRunHook = true;
              hasBinaryPathProperty = "binaryPath" in context;
            },
          ],
        },
      },
    };

    const result = await setup.installer.install("example-tool", toolConfig);
    assert(result.success);

    expect(didRunHook).toBe(true);
    expect(hasBinaryPathProperty).toBe(false);
  });
});
