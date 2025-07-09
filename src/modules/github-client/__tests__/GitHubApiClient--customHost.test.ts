import { describe, it, expect, beforeEach } from 'bun:test';
import { setupMockGitHubApiClient, createGitHubConfigOverride } from './helpers/sharedGitHubApiClientTestSetup';
import type { MockSetup } from './helpers/sharedGitHubApiClientTestSetup';

describe('GitHubApiClient with custom host', () => {
  let mocks: MockSetup;
  const customHost = 'https://github.example.com';

  beforeEach(() => {
    // Setup with custom GitHub host
    mocks = setupMockGitHubApiClient(createGitHubConfigOverride({ githubHost: customHost }));
  });

  it('should use the custom host for API requests', async () => {
    // Mock a successful response
    mocks.mockDownloader.download.mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          id: 123,
          tag_name: 'v1.0.0',
          name: 'Release 1.0.0',
          draft: false,
          prerelease: false,
          created_at: '2023-01-01T00:00:00Z',
          published_at: '2023-01-01T00:00:00Z',
          assets: [],
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
        })
      )
    );

    await mocks.apiClient.getLatestRelease('test-owner', 'test-repo');

    // Verify the URL used in the request contains the custom host
    expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
      `${customHost}/repos/test-owner/test-repo/releases/latest`,
      expect.anything()
    );
  });

  it('should use the custom host for getReleaseByTag', async () => {
    // Mock a successful response
    mocks.mockDownloader.download.mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          id: 123,
          tag_name: 'v1.0.0',
          name: 'Release 1.0.0',
          draft: false,
          prerelease: false,
          created_at: '2023-01-01T00:00:00Z',
          published_at: '2023-01-01T00:00:00Z',
          assets: [],
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
        })
      )
    );

    await mocks.apiClient.getReleaseByTag('test-owner', 'test-repo', 'v1.0.0');

    // Verify the URL used in the request contains the custom host
    expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
      `${customHost}/repos/test-owner/test-repo/releases/tags/v1.0.0`,
      expect.anything()
    );
  });

  it('should use the custom host for getAllReleases', async () => {
    // Mock a successful response
    mocks.mockDownloader.download.mockResolvedValue(Buffer.from(JSON.stringify([])));

    await mocks.apiClient.getAllReleases('test-owner', 'test-repo');

    // Verify the URL used in the request contains the custom host
    expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
      `${customHost}/repos/test-owner/test-repo/releases?per_page=30&page=1`,
      expect.anything()
    );
  });

  it('should use the custom host for getRateLimit', async () => {
    // Mock a successful response
    mocks.mockDownloader.download.mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          resources: {
            core: {
              limit: 60,
              remaining: 59,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 1,
              resource: 'core',
            },
            search: {
              limit: 10,
              remaining: 10,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'search',
            },
            graphql: {
              limit: 0,
              remaining: 0,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'graphql',
            },
            integration_manifest: {
              limit: 0,
              remaining: 0,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'integration_manifest',
            },
            source_import: {
              limit: 0,
              remaining: 0,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'source_import',
            },
            code_scanning_upload: {
              limit: 0,
              remaining: 0,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'code_scanning_upload',
            },
            actions_runner_registration: {
              limit: 0,
              remaining: 0,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'actions_runner_registration',
            },
            scim: {
              limit: 0,
              remaining: 0,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0,
              resource: 'scim',
            },
          },
          rate: {
            limit: 60,
            remaining: 59,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1,
            resource: 'core',
          },
        })
      )
    );

    await mocks.apiClient.getRateLimit();

    // Verify the URL used in the request contains the custom host
    expect(mocks.mockDownloader.download).toHaveBeenCalledWith(
      `${customHost}/rate_limit`,
      expect.anything()
    );
  });
});
