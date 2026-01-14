import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  createGitHubConfigOverride,
  type IMockSetup,
  setupMockGitHubApiClient,
} from './helpers/sharedGitHubApiClientTestSetup';

describe('GitHubApiClient', () => {
  let mocks: IMockSetup;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    mocks = await setupMockGitHubApiClient(
      createGitHubConfigOverride({ githubApiCacheEnabled: false, githubToken: '' }),
    );
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  describe('probeLatestTag', () => {
    it('should extract tag from redirect location header', async () => {
      // Mock fetch to return a redirect response
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/test-owner/test-repo/releases/tag/v2.24.0',
          },
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('test-owner', 'test-repo');

      expect(tag).toBe('v2.24.0');
      expect(fetchSpy).toHaveBeenCalledWith('https://github.com/test-owner/test-repo/releases/latest', {
        method: 'HEAD',
        redirect: 'manual',
      });

      // Verify logger received probe messages
      mocks.logger.expect(
        ['DEBUG'],
        ['GitHubApiClient', 'probeLatestTag'],
        [],
        ['Probing release tag pattern', 'Detected latest release tag'],
      );
    });

    it('should handle tags with v prefix', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/denisidoro/navi/releases/tag/v2.24.0',
          },
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('denisidoro', 'navi');
      expect(tag).toBe('v2.24.0');
    });

    it('should handle tags without v prefix', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/BurntSushi/ripgrep/releases/tag/15.1.0',
          },
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('BurntSushi', 'ripgrep');
      expect(tag).toBe('15.1.0');
    });

    it('should handle tags with tool-name prefix', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/jqlang/jq/releases/tag/jq-1.8.1',
          },
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('jqlang', 'jq');
      expect(tag).toBe('jq-1.8.1');
    });

    it('should URL-decode special characters in tags', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/owner/repo/releases/tag/v1.0.0%2Bbuild.123',
          },
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('owner', 'repo');
      expect(tag).toBe('v1.0.0+build.123');
    });

    it('should return null when no location header is present', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {},
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('test-owner', 'test-repo');
      expect(tag).toBeNull();

      mocks.logger.expect(
        ['DEBUG'],
        ['GitHubApiClient', 'probeLatestTag'],
        [],
        ['Probing release tag pattern', 'No redirect found'],
      );
    });

    it('should return null when location header does not contain tag path', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/test-owner/test-repo/releases',
          },
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('test-owner', 'test-repo');
      expect(tag).toBeNull();
    });

    it('should return null on network error', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const tag = await mocks.apiClient.probeLatestTag('test-owner', 'test-repo');
      expect(tag).toBeNull();

      mocks.logger.expect(
        ['DEBUG'],
        ['GitHubApiClient', 'probeLatestTag'],
        [],
        ['Probing release tag pattern', 'Failed to probe tag pattern'],
      );
    });

    it('should handle 404 response gracefully', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 404,
          headers: {},
        }),
      );

      const tag = await mocks.apiClient.probeLatestTag('nonexistent', 'repo');
      expect(tag).toBeNull();
    });
  });
});
