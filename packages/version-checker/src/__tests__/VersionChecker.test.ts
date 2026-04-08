import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, expect, it } from "bun:test";
import { VersionComparisonStatus } from "../IVersionChecker.ts";
import { VersionChecker } from "../VersionChecker.ts";
import { MockGitHubApiClient } from "./helpers/mocks";

describe("VersionChecker", () => {
  let mockGithubClient: MockGitHubApiClient;
  let versionChecker: VersionChecker;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    mockGithubClient = new MockGitHubApiClient();
    versionChecker = new VersionChecker(logger, mockGithubClient);
  });

  describe("getLatestToolVersion", () => {
    it("should return the latest version string from GitHub", async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce({
        tag_name: "1.2.3",
        assets: [],
        body: "",
        name: "",
        html_url: "",
        published_at: "",
        prerelease: false,
        id: 0,
        created_at: "",
        draft: false,
      });
      const version = await versionChecker.getLatestToolVersion("owner", "repo");
      expect(version).toBe("1.2.3");
      expect(mockGithubClient.getLatestRelease).toHaveBeenCalledWith("owner", "repo");
    });

    it('should remove "v" prefix from the version string', async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce({
        tag_name: "v0.5.0",
        assets: [],
        body: "",
        name: "",
        html_url: "",
        published_at: "",
        prerelease: false,
        id: 0,
        created_at: "",
        draft: false,
      });
      const version = await versionChecker.getLatestToolVersion("owner", "repo");
      expect(version).toBe("0.5.0");
    });

    it("should return null if GitHub client returns release with no tag_name", async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce({
        // Testing invalid state - release without tag_name
        tag_name: "" as string, // Empty string instead of undefined
        assets: [],
        body: "",
        name: "",
        html_url: "",
        published_at: "",
        prerelease: false,
        id: 0,
        created_at: "",
        draft: false,
      });
      const version = await versionChecker.getLatestToolVersion("owner", "repo");
      expect(version).toBeNull();
    });

    it("should return null if GitHub client returns null (404 error)", async () => {
      mockGithubClient.getLatestRelease.mockResolvedValueOnce(null);
      const version = await versionChecker.getLatestToolVersion("owner", "repo");
      expect(version).toBeNull();
    });

    it("should return null if GitHub client throws an error", async () => {
      mockGithubClient.getLatestRelease.mockRejectedValueOnce(new Error("API Error"));
      const version = await versionChecker.getLatestToolVersion("owner", "repo");
      expect(version).toBeNull();
    });
  });

  describe("checkVersionStatus", () => {
    it("should return NEWER_AVAILABLE if latest is greater", async () => {
      const status = await versionChecker.checkVersionStatus("1.0.0", "1.1.0");
      expect(status).toBe(VersionComparisonStatus.NEWER_AVAILABLE);
    });

    it("should return UP_TO_DATE if versions are equal", async () => {
      const status = await versionChecker.checkVersionStatus("1.0.0", "1.0.0");
      expect(status).toBe(VersionComparisonStatus.UP_TO_DATE);
    });

    it("should return AHEAD_OF_LATEST if current is greater", async () => {
      const status = await versionChecker.checkVersionStatus("1.1.0", "1.0.0");
      expect(status).toBe(VersionComparisonStatus.AHEAD_OF_LATEST);
    });

    it("should return INVALID_CURRENT_VERSION for invalid current version", async () => {
      const status = await versionChecker.checkVersionStatus("invalid", "1.0.0");
      expect(status).toBe(VersionComparisonStatus.INVALID_CURRENT_VERSION);
    });

    it("should return INVALID_LATEST_VERSION for invalid latest version", async () => {
      const status = await versionChecker.checkVersionStatus("1.0.0", "invalid");
      expect(status).toBe(VersionComparisonStatus.INVALID_LATEST_VERSION);
    });

    it('should handle "v" prefix in currentVersion', async () => {
      const status = await versionChecker.checkVersionStatus("v1.0.0", "1.1.0");
      expect(status).toBe(VersionComparisonStatus.NEWER_AVAILABLE);
    });

    it('should handle "v" prefix in latestVersion', async () => {
      const status = await versionChecker.checkVersionStatus("1.0.0", "v1.1.0");
      expect(status).toBe(VersionComparisonStatus.NEWER_AVAILABLE);
    });

    it('should handle "v" prefix in both versions', async () => {
      const status = await versionChecker.checkVersionStatus("v1.0.0", "v1.0.0");
      expect(status).toBe(VersionComparisonStatus.UP_TO_DATE);
    });
  });
});
