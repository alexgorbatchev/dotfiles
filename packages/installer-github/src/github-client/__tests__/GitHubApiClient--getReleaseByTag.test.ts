import type { IGitHubRelease } from "@dotfiles/core";
import { ClientError, NotFoundError, RateLimitError } from "@dotfiles/downloader";
import { beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert";
import { GitHubApiClientError } from "../GitHubApiClientError";
import {
  createGitHubConfigOverride,
  type IMockSetup,
  setupMockGitHubApiClient,
} from "./helpers/sharedGitHubApiClientTestSetup";

describe("GitHubApiClient", () => {
  let mocks: IMockSetup;

  beforeEach(async () => {
    // Explicitly disable API cache for these non-caching tests
    mocks = await setupMockGitHubApiClient(createGitHubConfigOverride({ githubApiCacheEnabled: false }));
  });

  describe("getReleaseByTag", () => {
    const mockReleaseData: IGitHubRelease = {
      tag_name: "v0.5.0",
      name: "Version 0.5.0",
      draft: false,
      prerelease: false,
      published_at: new Date().toISOString(),
      assets: [
        {
          name: "asset1.zip",
          browser_download_url: "http://example.com/asset1.zip",
          size: 1024,
          content_type: "application/zip",
          state: "uploaded",
          download_count: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      id: 2,
      created_at: new Date().toISOString(),
      body: "Release notes for v0.5.0",
      html_url: "http://example.com/release/v0.5.0",
    };

    it("should fetch and return the release for a given tag", async () => {
      mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify(mockReleaseData)));
      const release = await mocks.apiClient.getReleaseByTag("test-owner", "test-repo", "v0.5.0");
      expect(release).toEqual(mockReleaseData);
      expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
        expect.anything(), // parentLogger
        "https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.5.0",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/vnd.github.v3+json",
            "User-Agent": mocks.mockProjectConfig.github.userAgent,
          }),
        }),
      );

      // Verify logger received request message
      mocks.logger.expect(["DEBUG"], ["GitHubApiClient", "request"], [], ["GitHub API GET request to"]);
    });

    it("should return null if the release tag is not found (404)", async () => {
      const url = "https://api.github.com/repos/test-owner/test-repo/releases/tags/non-existent-tag";
      mocks.mockDownloader.download.mockRejectedValue(
        new NotFoundError(mocks.logger, url, new Error("Original 404 from downloader")),
      );
      const release = await mocks.apiClient.getReleaseByTag("test-owner", "test-repo", "non-existent-tag");
      expect(release).toBeNull();
    });

    it("should throw a GitHubApiClientError with rate limit details if a RateLimitError occurs", async () => {
      const url = "https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.5.0";
      const resetTimestamp = Date.now() + 1800 * 1000;
      mocks.mockDownloader.download.mockRejectedValue(
        new RateLimitError(
          mocks.logger,
          "Rate limited",
          url,
          429,
          "Too Many Requests",
          undefined, // responseBody
          {}, // headers
          resetTimestamp,
        ),
      );

      expect(mocks.apiClient.getReleaseByTag("test-owner", "test-repo", "v0.5.0")).rejects.toThrow(
        GitHubApiClientError,
      );

      try {
        await mocks.apiClient.getReleaseByTag("test-owner", "test-repo", "v0.5.0");
      } catch (error) {
        assert(error instanceof GitHubApiClientError);
        expect(error.message).toContain(`GitHub API rate limit exceeded for ${url}`);
        expect(error.statusCode).toBe(429);
        expect(error.originalError).toBeInstanceOf(RateLimitError);
      }
    });

    it("should throw a GitHubApiClientError for other failures (ClientError)", async () => {
      const url = "https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.5.0";
      mocks.mockDownloader.download.mockRejectedValue(new ClientError(mocks.logger, url, 400, "Bad Request"));

      expect(mocks.apiClient.getReleaseByTag("test-owner", "test-repo", "v0.5.0")).rejects.toThrow(
        GitHubApiClientError,
      );

      try {
        await mocks.apiClient.getReleaseByTag("test-owner", "test-repo", "v0.5.0");
      } catch (error) {
        assert(error instanceof GitHubApiClientError);
        expect(error.message).toContain(`GitHub API client error for ${url}`);
        expect(error.statusCode).toBe(400);
        expect(error.originalError).toBeInstanceOf(ClientError);
      }
    });
  });
});
