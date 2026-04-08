import { TestLogger } from "@dotfiles/logger";
import { describe, expect, it } from "bun:test";
import { GitHubApiClient } from "../GitHubApiClient";
import {
  createGitHubConfigOverride,
  createMockDownloader,
  createMockGitHubApiCache,
  createMockProjectConfigForGitHubApi,
  setupMockGitHubApiClient,
} from "./helpers/sharedGitHubApiClientTestSetup";

describe("GitHubApiClient", () => {
  it("should be defined", async () => {
    const { apiClient } = await setupMockGitHubApiClient();
    expect(apiClient).toBeDefined();
  });

  // Constructor tests
  describe("constructor", async () => {
    it("should initialize correctly without a token", async () => {
      const mockProjectConfig = await createMockProjectConfigForGitHubApi();
      const mockDownloader = createMockDownloader();
      const client = new GitHubApiClient(new TestLogger(), mockProjectConfig, mockDownloader);
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it("should initialize correctly with a token", async () => {
      const mockProjectConfig = await createMockProjectConfigForGitHubApi(
        createGitHubConfigOverride({ githubToken: "test-token" }),
      );
      const mockDownloader = createMockDownloader();
      const client = new GitHubApiClient(new TestLogger(), mockProjectConfig, mockDownloader);
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it("should initialize correctly with a cache", async () => {
      const mockProjectConfig = await createMockProjectConfigForGitHubApi();
      const mockDownloader = createMockDownloader();
      const mockCache = createMockGitHubApiCache();
      const client = new GitHubApiClient(new TestLogger(), mockProjectConfig, mockDownloader, mockCache);
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it("should respect cache configuration options", async () => {
      const mockDownloader = createMockDownloader();
      const mockCache = createMockGitHubApiCache();
      const configWithCacheDisabled = await createMockProjectConfigForGitHubApi(
        createGitHubConfigOverride({ githubApiCacheEnabled: false }),
      );
      const clientNoCache = new GitHubApiClient(new TestLogger(), configWithCacheDisabled, mockDownloader, mockCache);
      expect(clientNoCache).toBeInstanceOf(GitHubApiClient);
      // Add specific assertions here if the client stores these values internally
      // and they are accessible for testing, e.g. client.isCacheEnabled()

      const configWithCustomTtl = await createMockProjectConfigForGitHubApi(
        createGitHubConfigOverride({ githubApiCacheTtl: 7200000 }), // 2 hours
      );
      const clientWithCustomTtl = new GitHubApiClient(new TestLogger(), configWithCustomTtl, mockDownloader, mockCache);
      expect(clientWithCustomTtl).toBeInstanceOf(GitHubApiClient);
      // Add specific assertions for TTL if accessible
    });
  });
});
