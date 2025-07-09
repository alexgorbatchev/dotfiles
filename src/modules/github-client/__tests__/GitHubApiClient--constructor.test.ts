import { describe, expect, it } from 'bun:test';
import { GitHubApiClient } from '../GitHubApiClient';
import {
  createMockYamlConfig,
  createMockDownloader,
  createMockGitHubApiCache,
  setupMockGitHubApiClient,
  createGitHubConfigOverride
} from './helpers/sharedGitHubApiClientTestSetup';

describe('GitHubApiClient', () => {
  it('should be defined', () => {
    const { apiClient } = setupMockGitHubApiClient();
    expect(apiClient).toBeDefined();
  });

  // Constructor tests
  describe('constructor', () => {
    it('should initialize correctly without a token', () => {
      const mockYamlConfig = createMockYamlConfig();
      const mockDownloader = createMockDownloader();
      const client = new GitHubApiClient(mockYamlConfig, mockDownloader);
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should initialize correctly with a token', () => {
      const mockYamlConfig = createMockYamlConfig(createGitHubConfigOverride({ githubToken: 'test-token' }));
      const mockDownloader = createMockDownloader();
      const client = new GitHubApiClient(mockYamlConfig, mockDownloader);
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should initialize correctly with a cache', () => {
      const mockYamlConfig = createMockYamlConfig();
      const mockDownloader = createMockDownloader();
      const mockCache = createMockGitHubApiCache();
      const client = new GitHubApiClient(mockYamlConfig, mockDownloader, mockCache);
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should respect cache configuration options', () => {
      const mockDownloader = createMockDownloader();
      const mockCache = createMockGitHubApiCache();

      const configWithCacheDisabled = createMockYamlConfig(
        createGitHubConfigOverride({ githubApiCacheEnabled: false })
      );
      const clientNoCache = new GitHubApiClient(configWithCacheDisabled, mockDownloader, mockCache);
      expect(clientNoCache).toBeInstanceOf(GitHubApiClient);
      // Add specific assertions here if the client stores these values internally
      // and they are accessible for testing, e.g. client.isCacheEnabled()

      const configWithCustomTtl = createMockYamlConfig(
        createGitHubConfigOverride({ githubApiCacheTtl: 7200000 }) // 2 hours
      );
      const clientWithCustomTtl = new GitHubApiClient(
        configWithCustomTtl,
        mockDownloader,
        mockCache
      );
      expect(clientWithCustomTtl).toBeInstanceOf(GitHubApiClient);
      // Add specific assertions for TTL if accessible
    });
  });
});
