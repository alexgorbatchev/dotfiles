/**
 * End-to-End Tests for conflict detection and handling.
 *
 * These tests verify that the system correctly:
 * - Detects conflicts with existing non-generator files
 * - Prevents overwriting conflicting files during generate
 * - Reports detailed conflict information to the user
 * - Handles the --overwrite flag
 */
import { beforeAll, describe, expect, it } from "bun:test";

import { Architecture, Platform } from "@dotfiles/core";
import fs from "node:fs";
import path from "node:path";
import { GITHUB_RELEASE_TOOL, withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";
import type { ITestTarget } from "./helpers/types";

describe("E2E: conflict detection and handling", () => {
  withMockServer((b) => b.withGitHubTool(GITHUB_RELEASE_TOOL));

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

      const conflictingShimPath = path.join(harness.userBinDir, "github-release-tool");

      describe("conflict detection and handling", () => {
        beforeAll(async () => {
          await harness.clean();
        });

        it("should detect conflicts with existing non-generator files", async () => {
          // Create a conflicting file that is NOT a generator shim
          await fs.promises.mkdir(harness.userBinDir, { recursive: true });
          await fs.promises.writeFile(conflictingShimPath, "");

          // Run detect-conflicts command
          const detectResult = await harness.detectConflicts();

          // Should exit with error code 1
          expect(detectResult.code).toBe(1);

          // Should warn about the conflict (output goes to stdout)
          expect(detectResult.stdout).toContain("Conflicts detected with files not owned by the generator");
          expect(detectResult.stdout).toContain("[github-release-tool]");
          expect(detectResult.stdout).toContain(conflictingShimPath);
          expect(detectResult.stdout).toContain("exists but is not a generator shim");
        });

        it("should fail to generate when conflicting file exists", async () => {
          // The conflicting file should still exist from the previous test
          expect(await harness.fileExists(conflictingShimPath)).toBe(true);

          // Run generate command
          const generateResult = await harness.generate();

          // Generate completes successfully but skips the conflicting shim
          expect(generateResult.code).toBe(0);

          // Should error about the conflict
          expect(generateResult.stdout).toContain('Cannot create shim for "github-release-tool"');
          expect(generateResult.stdout).toContain("conflicting file exists at");
          expect(generateResult.stdout).toContain(conflictingShimPath);
          expect(generateResult.stdout).toContain("Use --overwrite to replace it");

          // Shell scripts should still be generated
          await harness.verifyShellScript("zsh");
          await harness.verifyShellScript("bash");
          await harness.verifyShellScript("powershell");

          // The conflicting file should still be the original (not a shim)
          const fileContent = await harness.readFile(conflictingShimPath);
          expect(fileContent).toBe(""); // Empty file we created with touch
        });

        it("should succeed with --overwrite flag when conflicting file exists", async () => {
          // The conflicting file should still exist
          expect(await harness.fileExists(conflictingShimPath)).toBe(true);

          // Run generate with --overwrite flag
          const generateResult = await harness.generate(["--overwrite"]);

          // Should succeed
          expect(generateResult.code).toBe(0);

          // Shim should now exist and be executable
          await harness.verifyShim("github-release-tool");

          // Shell scripts should be generated
          await harness.verifyShellScript("zsh");
          await harness.verifyShellScript("bash");
          await harness.verifyShellScript("powershell");
        });
      });
    });
  }
});
