/**
 * End-to-End Tests for the files command.
 *
 * These tests verify that the files command correctly:
 * - Displays tree of installed tool files
 * - Fails for tools that exist but are not installed
 */
import { beforeAll, describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "@dotfiles/testing-helpers";
import { Architecture, Platform } from "@dotfiles/core";
import { CARGO_QUICKINSTALL_TOOL, GITHUB_RELEASE_TOOL, withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";

describe("E2E: files command", () => {
  withMockServer((b) => b.withGitHubTool(GITHUB_RELEASE_TOOL).withCargoTool(CARGO_QUICKINSTALL_TOOL));

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

      describe("files command", () => {
        beforeAll(async () => {
          await harness.clean();
          await harness.generate();
        });

        it("should display tree of installed tool files", async () => {
          // Install the tool first
          const installResult = await harness.install(["github-release-tool"]);
          expect(installResult.code).toBe(0);

          // Then check files command
          const result = await harness.runCommand(["files", "--config", harness.configPath, "github-release-tool"]);

          expect(result.code).toBe(0);
          expect(result.stdout).toContain("github-release-tool");
          expect(result.stdout).toContain("└─");
        });

        it("should fail for tool that exists but is not installed", async () => {
          const result = await harness.runCommand(["files", "--config", harness.configPath, "cargo-quickinstall-tool"]);

          expect(result.code).not.toBe(0);
          expect(result.stdout).toContain("not installed");
        });
      });
    });
  }
});
