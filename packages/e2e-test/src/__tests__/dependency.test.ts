/**
 * End-to-End Tests for dependency resolution and ordering.
 *
 * These tests verify that the CLI correctly:
 * - Handles successful dependency resolution
 * - Detects missing dependency providers
 * - Detects ambiguous dependencies (multiple providers)
 * - Detects circular dependencies
 * - Handles platform-specific dependency availability
 */
import { describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "@dotfiles/testing-helpers";
import { Architecture, Platform } from "@dotfiles/core";
import { withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";
import type { ITestTarget } from "./helpers/types";

describe("E2E: dependency resolution", () => {
  // Dependency tests use manual installers, no mock endpoints needed
  withMockServer();

  const platformConfigs: ReadonlyArray<ITestTarget> = [
    { platform: Platform.MacOS, architecture: Architecture.Arm64, name: "macOS ARM64" },
    { platform: Platform.Linux, architecture: Architecture.X86_64, name: "Linux x86_64" },
  ];

  for (const config of platformConfigs) {
    describe(`${config.name}`, () => {
      describe("dependency resolution", () => {
        it("generates successfully when dependencies are satisfied", async () => {
          const harness = new TestHarness({
            testDir: import.meta.dir,
            configPath: "fixtures/dependency-success/config.ts",
            platform: config.platform,
            architecture: config.architecture,
            cleanBeforeRun: true,
          });
          const result = await harness.generate();
          expect(result.code).toBe(0);
        });

        it("fails when a dependency provider is missing", async () => {
          const harness = new TestHarness({
            testDir: import.meta.dir,
            configPath: "fixtures/dependency-missing/config.ts",
            platform: config.platform,
            architecture: config.architecture,
            cleanBeforeRun: true,
          });
          const result = await harness.generate();
          expect(result.code).toBe(1);
          const combinedOutput = `${result.stdout}${result.stderr}`;
          expect(combinedOutput).toContain('Missing dependency: tool "dependency-consumer-missing" requires binary');
          expect(combinedOutput).toContain("missing-provider");
        });

        it("fails when multiple tools provide the same dependency", async () => {
          const harness = new TestHarness({
            testDir: import.meta.dir,
            configPath: "fixtures/dependency-ambiguous/config.ts",
            platform: config.platform,
            architecture: config.architecture,
            cleanBeforeRun: true,
          });
          const result = await harness.generate();
          expect(result.code).toBe(1);
          const combinedOutput = `${result.stdout}${result.stderr}`;
          expect(combinedOutput).toContain(
            'Ambiguous dependency: binary "shared-dependency" is provided by multiple tools',
          );
          expect(combinedOutput).toContain("dependency-provider-a");
          expect(combinedOutput).toContain("dependency-provider-b");
          expect(combinedOutput).toContain("dependency-consumer-ambiguous");
        });

        it("fails when dependencies create a cycle", async () => {
          const harness = new TestHarness({
            testDir: import.meta.dir,
            configPath: "fixtures/dependency-circular/config.ts",
            platform: config.platform,
            architecture: config.architecture,
            cleanBeforeRun: true,
          });
          const result = await harness.generate();
          expect(result.code).toBe(1);
          const combinedOutput = `${result.stdout}${result.stderr}`;
          expect(combinedOutput).toContain("Circular dependency detected between tools");
          expect(combinedOutput).toContain("dependency-cycle-a");
          expect(combinedOutput).toContain("dependency-cycle-b");
        });

        it("fails when the dependency provider is unavailable on the active platform", async () => {
          const harness = new TestHarness({
            testDir: import.meta.dir,
            configPath: "fixtures/dependency-platform-mismatch/config.ts",
            platform: config.platform,
            architecture: config.architecture,
            cleanBeforeRun: true,
          });
          const result = await harness.generate();
          expect(result.code).toBe(1);
          const combinedOutput = `${result.stdout}${result.stderr}`;
          expect(combinedOutput).toContain('Missing dependency: tool "dependency-platform-consumer" requires binary');
          expect(combinedOutput).toContain("platform-specific-binary");
        });
      });
    });
  }
});
