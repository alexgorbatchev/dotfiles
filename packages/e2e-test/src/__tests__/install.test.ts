/**
 * End-to-End Tests for the install command.
 *
 * These tests verify that the install command correctly:
 * - Downloads and installs tool binaries
 * - Creates symlinks to installed binaries
 * - Makes binaries executable and accessible through shims
 * - Completes before shims are used
 * - Resolves binary names to tool names for installation
 */
import { beforeAll, describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "@dotfiles/testing-helpers";
import { Architecture, Platform } from "@dotfiles/core";
import path from "node:path";
import { GITHUB_RELEASE_TOOL, INSTALL_BY_BINARY_TOOL, withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";
import type { ITestTarget } from "./helpers/types";

describe("E2E: install command", () => {
  withMockServer((b) => b.withGitHubTool(GITHUB_RELEASE_TOOL).withGitHubTool(INSTALL_BY_BINARY_TOOL));

  const platformConfigs: ReadonlyArray<ITestTarget> = [
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

      const toolDir = path.join(harness.generatedDir, "binaries", "github-release-tool");
      const currentDir = path.join(toolDir, "current");
      const binaryPath = path.join(currentDir, "github-release-tool");

      beforeAll(async () => {
        await harness.clean();
        const generateResult = await harness.generate();
        expect(generateResult.code).toBe(0);
      });

      describe("install command", () => {
        beforeAll(async () => {
          // Clean up binaries directory to ensure fresh install
          await harness.cleanBinaries();
        });

        it("should install github-release-tool and verify binary is downloaded before shim is called", async () => {
          // Verify the binary symlink does NOT exist before install
          expect(await harness.fileExists(binaryPath)).toBe(false);

          // Run install command
          const result = await harness.install(["github-release-tool"]);
          expect(result.code).toBe(0);

          // Check symlink exists
          expect(await harness.fileExists(binaryPath)).toBe(true);

          // Verify symlink is executable
          expect(await harness.isExecutable(binaryPath)).toBe(true);

          // Now verify the binary works by executing it
          await harness.verifyShim("github-release-tool", {
            args: ["--version"],
            expectedExitCode: 0,
            stdoutMatcher: (stdout) => stdout === "1.0.0",
          });
        });

        it("should install completion file for github-release-tool", async () => {
          const completionPath = path.join(harness.shellScriptsDir, "zsh", "completions", "_github-release-tool");
          expect(await harness.fileExists(completionPath)).toBe(true);
        });
      });

      describe("install by binary name", () => {
        const installByBinaryToolDir = path.join(harness.generatedDir, "binaries", "install-by-binary-tool");
        const installByBinaryCurrentDir = path.join(installByBinaryToolDir, "current");
        const installByBinaryPath = path.join(installByBinaryCurrentDir, "my-custom-binary");

        beforeAll(async () => {
          // Clean up binaries directory to ensure fresh install
          await harness.cleanBinaries();
        });

        it("should install tool when specifying a binary name instead of tool name", async () => {
          // Verify the binary does NOT exist before install
          expect(await harness.fileExists(installByBinaryPath)).toBe(false);

          // Run install command with binary name instead of tool name
          // The tool is called 'install-by-binary-tool' but provides binary 'my-custom-binary'
          const result = await harness.install(["my-custom-binary"]);
          expect(result.code).toBe(0);

          // Verify stdout indicates tool was found by binary name
          expect(result.stdout).toContain("install-by-binary-tool");

          // Check binary symlink exists
          expect(await harness.fileExists(installByBinaryPath)).toBe(true);

          // Verify binary is executable
          expect(await harness.isExecutable(installByBinaryPath)).toBe(true);
        });

        it("should still work when installing by tool name directly", async () => {
          // Clean up for fresh test
          await harness.cleanBinaries();

          // Verify the binary does NOT exist before install
          expect(await harness.fileExists(installByBinaryPath)).toBe(false);

          // Run install command with tool name directly
          const result = await harness.install(["install-by-binary-tool"]);
          expect(result.code).toBe(0);

          // Check binary symlink exists
          expect(await harness.fileExists(installByBinaryPath)).toBe(true);

          // Verify binary is executable
          expect(await harness.isExecutable(installByBinaryPath)).toBe(true);
        });
      });
    });
  }
});
