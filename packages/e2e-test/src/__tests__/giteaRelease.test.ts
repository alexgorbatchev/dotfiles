/**
 * End-to-End Tests for the gitea-release installation method.
 *
 * These tests verify that the gitea-release installer correctly:
 * - Generates shims and shell scripts for Gitea-hosted tools
 * - Downloads and installs binaries from Gitea/Forgejo releases
 * - Creates symlinks to installed binaries
 * - Makes binaries executable and accessible through shims
 * - Detects and downloads newer versions via update command
 */
import { beforeAll, describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "@dotfiles/testing-helpers";
import { Architecture, Platform } from "@dotfiles/core";
import path from "node:path";
import { getServerPort, GITEA_RELEASE_TOOL, GITHUB_RELEASE_TOOL, withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";

describe("E2E: gitea-release installation method", () => {
  withMockServer((b) => b.withGitHubTool(GITHUB_RELEASE_TOOL).withGiteaTool(GITEA_RELEASE_TOOL));

  const platformConfigs: ReadonlyArray<{
    platform: Platform;
    architecture: Architecture;
    name: string;
  }> = [
    { platform: Platform.MacOS, architecture: Architecture.Arm64, name: "macOS ARM64" },
    { platform: Platform.Linux, architecture: Architecture.X86_64, name: "Linux x86_64" },
  ];

  for (const config of platformConfigs) {
    describe(`${config.name}`, () => {
      const harness: TestHarness = new TestHarness({
        testDir: import.meta.dir,
        configPath: "fixtures/main/config.ts",
        platform: config.platform,
        architecture: config.architecture,
      });

      const toolDir = path.join(harness.generatedDir, "binaries", "gitea-release-tool");
      const currentDir = path.join(toolDir, "current");
      const binaryPath = path.join(currentDir, "gitea-release-tool");

      describe("generate command", () => {
        beforeAll(async () => {
          await harness.clean();
          const result = await harness.generate();
          expect(result.code).toBe(0);
        });

        it("should generate shim for gitea-release-tool", async () => {
          await harness.verifyShim("gitea-release-tool");
        });

        it("should generate shell init scripts", async () => {
          await harness.verifyShellScript("zsh");
          await harness.verifyShellScript("bash");
        });

        it("should set GITEA_RELEASE_TOOL_OPTS environment variable", async () => {
          await harness.verifyEnvironmentVariable("gitea-release-tool", "GITEA_RELEASE_TOOL_OPTS", "--color=auto");
        });

        it("should set gitea-release-tool alias", async () => {
          await harness.verifyAlias("gitea-release-tool", "grt2", "gitea-release-tool --verbose");
        });
      });

      describe("install command", () => {
        beforeAll(async () => {
          await fetch(`http://127.0.0.1:${getServerPort()}/reset-versions`);
          await harness.clean();
          const generateResult = await harness.generate();
          expect(generateResult.code).toBe(0);
          await harness.cleanBinaries();
        });

        it("should install gitea-release-tool and verify binary is downloaded", async () => {
          expect(await harness.fileExists(binaryPath)).toBe(false);

          const result = await harness.install(["gitea-release-tool"]);
          expect(result.code).toBe(0);

          expect(await harness.fileExists(binaryPath)).toBe(true);
          expect(await harness.isExecutable(binaryPath)).toBe(true);

          await harness.verifyShim("gitea-release-tool", {
            args: ["--version"],
            expectedExitCode: 0,
            stdoutMatcher: (stdout) => stdout === "1.0.0",
          });
        });
      });

      describe("update command", () => {
        beforeAll(async () => {
          await fetch(`http://127.0.0.1:${getServerPort()}/reset-versions`);
          await harness.clean();
          const generateResult = await harness.generate();
          expect(generateResult.code).toBe(0);

          await harness.verifyShim("gitea-release-tool", {
            args: ["--version"],
            expectedExitCode: 0,
          });
        });

        it("should update gitea-release-tool to newer version", async () => {
          const versionBefore = await harness.verifyShim("gitea-release-tool", {
            args: ["--version"],
            expectedExitCode: 0,
          });
          expect(versionBefore.trim()).toBe("1.0.0");

          await fetch(`http://127.0.0.1:${getServerPort()}/set-tool-version/repo/gitea-release-tool/2.0.0`);

          const updateResult = await harness.update("gitea-release-tool");
          expect(updateResult.code).toBe(0);

          const versionAfter = await harness.verifyShim("gitea-release-tool", {
            args: ["--version"],
            expectedExitCode: 0,
          });
          expect(versionAfter.trim()).toBe("2.0.0");
        });
      });
    });
  }
});
