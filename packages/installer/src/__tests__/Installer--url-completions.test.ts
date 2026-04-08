import { describe, expect, it, mock } from "bun:test";
import assert from "node:assert";
import path from "node:path";
import { createGithubReleaseToolConfig, createInstallerTestSetup } from "./installer-test-helpers";

describe("Installer - URL completions", () => {
  it("prepares URL completion sources before after-install hooks run", async () => {
    const setup = await createInstallerTestSetup();
    const toolName = "bun";
    const completionUrl = "https://example.com/completions/bun.zsh";
    const patchedContent = "patched completion content";

    const afterInstallHook = mock(async (context) => {
      const completionPath = path.join(context.installedDir, "bun.zsh");
      const fileExists = await setup.fs.exists(completionPath);

      expect(fileExists).toBe(true);

      await context.replaceInFile(completionPath, /mock binary content/, patchedContent);
    });

    const toolConfig = createGithubReleaseToolConfig({
      name: toolName,
      binaries: [toolName],
      installParams: {
        repo: "oven-sh/bun",
        hooks: {
          "after-install": [afterInstallHook],
        },
      },
      shellConfigs: {
        zsh: {
          completions: {
            url: completionUrl,
            bin: toolName,
          },
        },
      },
    });

    const result = await setup.installer.install(toolName, toolConfig);

    assert(result.success);
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    const installedCompletionPath = path.join(setup.testDirs.paths.binariesDir, toolName, "1.0.0", "bun.zsh");
    const installedCompletionContent = await setup.fs.readFile(installedCompletionPath);

    expect(installedCompletionContent).toBe(patchedContent);
  });
});
