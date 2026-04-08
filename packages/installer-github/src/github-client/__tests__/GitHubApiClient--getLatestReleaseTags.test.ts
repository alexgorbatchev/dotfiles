import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type IMockSetup, setupMockGitHubApiClient } from "./helpers/sharedGitHubApiClientTestSetup";

describe("GitHubApiClient", () => {
  let mocks: IMockSetup;

  beforeEach(async () => {
    mocks = await setupMockGitHubApiClient();
  });

  afterEach(() => {
    mocks.mockDownloader.download.mockClear();
    mocks.mockCache.get.mockClear();
    mocks.mockCache.set.mockClear();
  });

  describe("getLatestReleaseTags", () => {
    it("should return release tags from API response", async () => {
      const mockReleases = [
        { tag_name: "v2.24.0", id: 1, name: "Release 2.24.0" },
        { tag_name: "v2.23.0", id: 2, name: "Release 2.23.0" },
        { tag_name: "v2.22.0", id: 3, name: "Release 2.22.0" },
      ];

      mocks.mockDownloader.download.mockImplementation(async () => {
        return Buffer.from(JSON.stringify(mockReleases));
      });

      const tags = await mocks.apiClient.getLatestReleaseTags("denisidoro", "navi");

      expect(tags).toEqual(["v2.24.0", "v2.23.0", "v2.22.0"]);
    });

    it("should respect count parameter", async () => {
      const mockReleases = [
        { tag_name: "v3.0.0", id: 1, name: "Release 3.0.0" },
        { tag_name: "v2.0.0", id: 2, name: "Release 2.0.0" },
        { tag_name: "v1.0.0", id: 3, name: "Release 1.0.0" },
      ];

      mocks.mockDownloader.download.mockImplementation(async () => {
        return Buffer.from(JSON.stringify(mockReleases));
      });

      const tags = await mocks.apiClient.getLatestReleaseTags("owner", "repo", 3);

      expect(tags).toEqual(["v3.0.0", "v2.0.0", "v1.0.0"]);
      mocks.logger.expect(
        ["DEBUG"],
        ["GitHubApiClient", "getLatestReleaseTags"],
        [],
        ["Fetching 3 latest release tags"],
      );
    });

    it("should return empty array on error", async () => {
      mocks.mockDownloader.download.mockImplementation(async () => {
        throw new Error("API error");
      });

      const tags = await mocks.apiClient.getLatestReleaseTags("owner", "repo");

      expect(tags).toEqual([]);
      mocks.logger.expect(
        ["DEBUG"],
        ["GitHubApiClient", "getLatestReleaseTags"],
        [],
        ["Fetching 5 latest release tags", "Error fetching release tags"],
      );
    });

    it("should use default count of 5", async () => {
      const mockReleases = [
        { tag_name: "v5.0.0", id: 1 },
        { tag_name: "v4.0.0", id: 2 },
        { tag_name: "v3.0.0", id: 3 },
        { tag_name: "v2.0.0", id: 4 },
        { tag_name: "v1.0.0", id: 5 },
      ];

      mocks.mockDownloader.download.mockImplementation(async () => {
        return Buffer.from(JSON.stringify(mockReleases));
      });

      const tags = await mocks.apiClient.getLatestReleaseTags("owner", "repo");

      expect(tags).toEqual(["v5.0.0", "v4.0.0", "v3.0.0", "v2.0.0", "v1.0.0"]);
      mocks.logger.expect(
        ["DEBUG"],
        ["GitHubApiClient", "getLatestReleaseTags"],
        [],
        ["Fetching 5 latest release tags"],
      );
    });

    it("should return empty array when no releases exist", async () => {
      mocks.mockDownloader.download.mockImplementation(async () => {
        return Buffer.from(JSON.stringify([]));
      });

      const tags = await mocks.apiClient.getLatestReleaseTags("owner", "repo");

      expect(tags).toEqual([]);
      mocks.logger.expect(
        ["DEBUG"],
        ["GitHubApiClient", "getLatestReleaseTags"],
        [],
        ["Fetching 5 latest release tags", "Fetched 0 release tags"],
      );
    });
  });
});
