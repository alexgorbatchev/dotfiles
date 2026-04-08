/**
 * End-to-End Tests for version detection.
 *
 * These tests verify that version detection works correctly after installation:
 * - Detects version from binary output using custom args
 * - Detects version using default args (--version) and semver regex
 * - Falls back to timestamp when version detection fails
 */
import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "@dotfiles/testing-helpers";
import { Architecture, Platform } from "@dotfiles/core";
import assert from "node:assert";
import path from "node:path";
import { withMockServer } from "./helpers/mock-server";
import { TestHarness } from "./helpers/TestHarness";
import type { ITestTarget } from "./helpers/types";

interface IToolInstallationRow {
  tool_name: string;
  version: string;
  install_path: string;
}

type ToolInstallationQueryParameters = {
  $toolName: string;
};

function getToolInstallation(generatedDir: string, toolName: string): IToolInstallationRow | null {
  const dbPath = path.join(generatedDir, "registry.db");
  const db = new Database(dbPath);
  const row = db
    .query<IToolInstallationRow, ToolInstallationQueryParameters>("SELECT * FROM tool_installations WHERE tool_name = $toolName")
    .get({ $toolName: toolName });
  db.close();
  return row;
}

describe("E2E: version detection", () => {
  withMockServer((b) =>
    b
      .withScript(
        "/mock-install-version-detection-curl-script-with-args.sh",
        "tools/version-detection--curl-script--with-args/mock-install.sh",
      )
      .withScript(
        "/mock-install-version-detection-curl-script-default-args.sh",
        "tools/version-detection--curl-script--default-args/mock-install.sh",
      )
      .withScript(
        "/mock-install-version-detection-curl-script-no-version.sh",
        "tools/version-detection--curl-script--no-version/mock-install-version-detection-curl-script-no-version.sh",
      )
      .withTarball(
        "/mock-install-version-detection-curl-tar-with-args.tar.gz",
        "tools/version-detection--curl-tar--with-args/mock-install-version-detection-curl-tar-with-args.tar.gz",
      )
      .withTarball(
        "/mock-install-version-detection-curl-tar-default-args.tar.gz",
        "tools/version-detection--curl-tar--default-args/mock-install-version-detection-curl-tar-default-args.tar.gz",
      )
      .withBinary(
        "/mock-binary-version-detection-curl-binary-with-args",
        "tools/version-detection--curl-binary--with-args/version-detection--curl-binary--with-args",
      )
      .withBinary(
        "/mock-binary-version-detection-curl-binary-default-args",
        "tools/version-detection--curl-binary--default-args/version-detection--curl-binary--default-args",
      ),
  );

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

      beforeAll(async () => {
        await harness.clean();
        const generateResult = await harness.generate();
        expect(generateResult.code).toBe(0);
      });

      async function verifyVersionDetection(toolName: string, expectedVersion: string): Promise<void> {
        const result = await harness.install([toolName], ["--log=verbose", "--trace"]);
        expect(result.code).toBe(0);

        const binPath = path.join(harness.generatedDir, "binaries", toolName, "current", toolName);
        expect(await harness.fileExists(binPath)).toBe(true);

        const row = getToolInstallation(harness.generatedDir, toolName);
        assert.ok(row);
        expect(row.version).toBe(expectedVersion);
        expect(row.install_path).toContain(`${toolName}/${expectedVersion}`);
      }

      describe("version detection", () => {
        it("should detect version after installation", async () => {
          await verifyVersionDetection("version-detection--curl-script--with-args", "2.3.4");
        }, 30000);

        it("should detect version using default args (--version) and semver regex", async () => {
          await verifyVersionDetection("version-detection--curl-script--default-args", "1.38.1");
        }, 30000);

        it("should detect version after installation (curl-tar)", async () => {
          await verifyVersionDetection("version-detection--curl-tar--with-args", "3.4.5");
        }, 30000);

        it("should detect version using default args (curl-tar)", async () => {
          await verifyVersionDetection("version-detection--curl-tar--default-args", "4.5.6");
        }, 30000);

        it("should detect version after installation (curl-binary)", async () => {
          await verifyVersionDetection("version-detection--curl-binary--with-args", "5.6.7");
        }, 30000);

        it("should detect version using default args (curl-binary)", async () => {
          await verifyVersionDetection("version-detection--curl-binary--default-args", "6.7.8");
        }, 30000);

        it("should fall back to timestamp when version detection fails", async () => {
          const toolName = "version-detection--curl-script--no-version";
          const result = await harness.install([toolName], ["--log=verbose", "--trace"]);

          expect(result.code).toBe(0);

          const binPath = path.join(harness.generatedDir, "binaries", toolName, "current", toolName);
          expect(await harness.fileExists(binPath)).toBe(true);

          const row = getToolInstallation(harness.generatedDir, toolName);
          assert.ok(row);

          // Version should be a timestamp format (YYYY-MM-DD-HH-MM-SS)
          expect(row.version).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
          expect(row.install_path).toContain(`${toolName}/${row.version}`);
        }, 30000);
      });
    });
  }
});
