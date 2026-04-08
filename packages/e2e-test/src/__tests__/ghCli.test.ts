/**
 * End-to-End Tests for GhCliApiClient integration.
 *
 * These tests verify that the GhCliApiClient correctly constructs and executes
 * `gh api` commands with proper arguments, including:
 * - Basic API endpoint requests
 * - Custom hostname for GitHub Enterprise
 * - Proper argument ordering and formatting
 *
 * Uses a mock `gh` shell script that logs all invocations to verify arguments.
 */
import { beforeAll, describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "@dotfiles/testing-helpers";
import { Architecture, Platform } from "@dotfiles/core";
import fs from "node:fs";
import path from "node:path";
import { withMockServer } from "./helpers/mock-server";
import type { IGitHubToolConfig } from "./helpers/mock-server/types";
import { TestHarness } from "./helpers/TestHarness";

/**
 * Tool config for gh-cli-test-tool.
 * The mock gh script handles the API response, but we need the mock server
 * for binary downloads.
 */
const GH_CLI_TEST_TOOL: IGitHubToolConfig = {
  repo: "org/gh-cli-test-tool",
  toolDir: "tools/gh-cli-test-tool",
  defaultVersion: "1.0.0",
  versions: [
    {
      version: "1.0.0",
      assets: {
        "macos.*arm64": "gh-cli-test-tool-1.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "gh-cli-test-tool-1.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

/**
 * Tool config for enterprise-tool (GitHub Enterprise).
 */
const ENTERPRISE_TOOL: IGitHubToolConfig = {
  repo: "enterprise-org/enterprise-tool",
  toolDir: "tools/enterprise-tool",
  defaultVersion: "2.0.0",
  versions: [
    {
      version: "2.0.0",
      assets: {
        "macos.*arm64": "enterprise-tool-2.0.0-macos_arm64.tar.gz",
        "linux.*(x86_64|amd64)": "enterprise-tool-2.0.0-linux_amd64.tar.gz",
      },
    },
  ],
};

describe("E2E: GhCliApiClient", () => {
  const mockGhDir = path.resolve(import.meta.dir, "fixtures/gh-cli/mock-gh");
  const logFile = path.join(mockGhDir, "invocations.log");

  /**
   * Helper to read and parse the mock gh invocation log.
   */
  async function getGhInvocations(): Promise<string[]> {
    try {
      const content = await fs.promises.readFile(logFile, "utf8");
      return content.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Helper to clear the invocation log.
   */
  async function clearInvocationLog(): Promise<void> {
    try {
      await fs.promises.unlink(logFile);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  describe("Standard GitHub (github.com)", () => {
    withMockServer((b) => b.withGitHubTool(GH_CLI_TEST_TOOL), "gh-cli");

    const harness: TestHarness = new TestHarness({
      testDir: import.meta.dir,
      configPath: "fixtures/gh-cli/config.ts",
      platform: Platform.MacOS,
      architecture: Architecture.Arm64,
    });

    beforeAll(async () => {
      await clearInvocationLog();
      await harness.clean();
      const generateResult = await harness.generate();
      expect(generateResult.code).toBe(0);
    });

    it("should call gh api with correct endpoint for releases/latest", async () => {
      await clearInvocationLog();
      await harness.cleanBinaries();

      // Run install with mock gh in PATH
      const result = await harness.runCommand(
        ["install", "--config", "fixtures/gh-cli/config.ts", "gh-cli-test-tool"],
        {
          env: {
            PATH: `${mockGhDir}:${process.env["PATH"] ?? ""}`,
            MOCK_GH_LOG_FILE: logFile,
          },
        },
      );

      expect(result.code).toBe(0);

      const invocations = await getGhInvocations();
      expect(invocations.length).toBeGreaterThan(0);

      // Verify the gh api command was called with the correct endpoint
      // Should NOT include --hostname since it's standard github.com
      const latestReleaseCall = invocations.find((call) => call.includes("repos/org/gh-cli-test-tool/releases/latest"));
      expect(latestReleaseCall).toBeDefined();

      // Should call 'gh api repos/org/gh-cli-test-tool/releases/latest'
      // without --hostname flag for standard GitHub
      expect(latestReleaseCall).toBe("api repos/org/gh-cli-test-tool/releases/latest");
    });

    it("should NOT include --hostname flag for standard github.com", async () => {
      await clearInvocationLog();
      await harness.cleanBinaries();

      const result = await harness.runCommand(
        ["install", "--config", "fixtures/gh-cli/config.ts", "gh-cli-test-tool"],
        {
          env: {
            PATH: `${mockGhDir}:${process.env["PATH"] ?? ""}`,
            MOCK_GH_LOG_FILE: logFile,
          },
        },
      );

      expect(result.code).toBe(0);

      const invocations = await getGhInvocations();
      const hasHostnameFlag = invocations.some((call) => call.includes("--hostname"));
      expect(hasHostnameFlag).toBe(false);
    });
  });

  describe("GitHub Enterprise", () => {
    withMockServer((b) => b.withGitHubTool(ENTERPRISE_TOOL), "gh-cli-enterprise");

    const harness: TestHarness = new TestHarness({
      testDir: import.meta.dir,
      configPath: "fixtures/gh-cli-enterprise/config.ts",
      platform: Platform.MacOS,
      architecture: Architecture.Arm64,
    });

    beforeAll(async () => {
      await clearInvocationLog();
      await harness.clean();
      const generateResult = await harness.generate();
      expect(generateResult.code).toBe(0);
    });

    it("should call gh api with --hostname flag for GitHub Enterprise", async () => {
      await clearInvocationLog();
      await harness.cleanBinaries();

      const result = await harness.runCommand(
        ["install", "--config", "fixtures/gh-cli-enterprise/config.ts", "enterprise-tool"],
        {
          env: {
            PATH: `${mockGhDir}:${process.env["PATH"] ?? ""}`,
            MOCK_GH_LOG_FILE: logFile,
          },
        },
      );

      expect(result.code).toBe(0);

      const invocations = await getGhInvocations();
      expect(invocations.length).toBeGreaterThan(0);

      // Find the API call and verify it includes --hostname
      const latestReleaseCall = invocations.find((call) =>
        call.includes("repos/enterprise-org/enterprise-tool/releases/latest"),
      );
      expect(latestReleaseCall).toBeDefined();

      // Should include --hostname github.enterprise.com
      expect(latestReleaseCall).toContain("--hostname");
      expect(latestReleaseCall).toContain("github.enterprise.com");
    });

    it("should use correct hostname extracted from API URL", async () => {
      await clearInvocationLog();
      await harness.cleanBinaries();

      const result = await harness.runCommand(
        ["install", "--config", "fixtures/gh-cli-enterprise/config.ts", "enterprise-tool"],
        {
          env: {
            PATH: `${mockGhDir}:${process.env["PATH"] ?? ""}`,
            MOCK_GH_LOG_FILE: logFile,
          },
        },
      );

      expect(result.code).toBe(0);

      const invocations = await getGhInvocations();
      const enterpriseCall = invocations.find((call) => call.includes("--hostname"));

      // Config has 'https://api.github.enterprise.com' - should extract 'github.enterprise.com'
      // (api. prefix should be stripped)
      expect(enterpriseCall).toBeDefined();
      expect(enterpriseCall).toMatchInlineSnapshot(
        `"api --hostname github.enterprise.com repos/enterprise-org/enterprise-tool/releases/latest"`,
      );
    });
  });

  describe("gh api command structure", () => {
    withMockServer((b) => b.withGitHubTool(GH_CLI_TEST_TOOL), "gh-cli");

    const harness: TestHarness = new TestHarness({
      testDir: import.meta.dir,
      configPath: "fixtures/gh-cli/config.ts",
      platform: Platform.Linux,
      architecture: Architecture.X86_64,
    });

    beforeAll(async () => {
      await clearInvocationLog();
      await harness.clean();
      const generateResult = await harness.generate();
      expect(generateResult.code).toBe(0);
    });

    it("should construct gh api command with api subcommand first", async () => {
      await clearInvocationLog();
      await harness.cleanBinaries();

      const result = await harness.runCommand(
        ["install", "--config", "fixtures/gh-cli/config.ts", "gh-cli-test-tool"],
        {
          env: {
            PATH: `${mockGhDir}:${process.env["PATH"] ?? ""}`,
            MOCK_GH_LOG_FILE: logFile,
          },
        },
      );

      expect(result.code).toBe(0);

      const invocations = await getGhInvocations();
      expect(invocations.length).toBeGreaterThan(0);

      // All invocations should start with 'api' or 'release' (for downloads)
      for (const invocation of invocations) {
        const isValidCommand = invocation.startsWith("api ") || invocation.startsWith("release ");
        expect(isValidCommand).toBe(true);
      }
    });

    it("should use correct endpoint path without leading slash", async () => {
      await clearInvocationLog();
      await harness.cleanBinaries();

      const result = await harness.runCommand(
        ["install", "--config", "fixtures/gh-cli/config.ts", "gh-cli-test-tool"],
        {
          env: {
            PATH: `${mockGhDir}:${process.env["PATH"] ?? ""}`,
            MOCK_GH_LOG_FILE: logFile,
          },
        },
      );

      expect(result.code).toBe(0);

      const invocations = await getGhInvocations();

      // Endpoint should not have leading slash (gh api doesn't need it)
      const hasLeadingSlash = invocations.some((call) => call.includes(" /repos/"));
      expect(hasLeadingSlash).toBe(false);

      // Should use 'repos/' without leading slash
      const hasCorrectPath = invocations.some((call) => call.includes(" repos/"));
      expect(hasCorrectPath).toBe(true);
    });
  });
});
