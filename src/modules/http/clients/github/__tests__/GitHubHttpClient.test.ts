import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { HttpCache, BaseHttpClient, HttpPipelineError, FetchTransport } from '@modules/http';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import { FetchMockHelper, TestLogger } from '@testing-helpers';
import { GitHubHttpClient } from '../GitHubHttpClient';
import type { GitHubRateLimit, GitHubRelease } from '../schemas';
import GITHUB_RATE_LIMIT_FIXTURE from './fixtures--github-rate-limit.json';
import GITHUB_RELEASE_FIXTURE from './fixtures--github-release.json';

setupTestCleanup();
const mockModules = createModuleMocker();

describe('GitHubHttpClient', () => {
  let fetchMock: FetchMockHelper;
  let logger: TestLogger;
  let baseClient: BaseHttpClient;
  let githubClient: GitHubHttpClient;

  const MOCK_RELEASE = GITHUB_RELEASE_FIXTURE as unknown as GitHubRelease;
  const MOCK_RATE_LIMIT = GITHUB_RATE_LIMIT_FIXTURE as unknown as GitHubRateLimit;

  beforeEach(() => {
    fetchMock = new FetchMockHelper();
    fetchMock.setup();
    fetchMock.reset();

    logger = new TestLogger();
    const transport = new FetchTransport({});
    const cache = new HttpCache();

    baseClient = new BaseHttpClient({
      transport,
      cache,
      logger,
      cacheEnabled: true,
    });

    githubClient = new GitHubHttpClient({
      baseHttpClient: baseClient,
      logger,
    });
  });

  afterAll(() => {
    clearMockRegistry();
    mockModules.restoreAll();
    fetchMock.restore();
  });

  describe('getLatestRelease', () => {
    test('fetches latest release successfully', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      const release = await githubClient.getLatestRelease('owner', 'repo');

      expect(release.tag_name).toBe('v25.5.31');
      expect(release.name).toBe('v25.5.31');
      expect(release.assets.length).toBeGreaterThan(0);
      expect(release.assets[0]?.name).toBe('yazi-aarch64-apple-darwin.zip');
    });

    test('uses correct GitHub API URL', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      await githubClient.getLatestRelease('test-owner', 'test-repo');

      const spy = fetchMock.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0];
      expect(callArgs?.[0]).toBe('https://api.github.com/repos/test-owner/test-repo/releases/latest');
    });

    test('includes proper headers', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      await githubClient.getLatestRelease('owner', 'repo');

      const spy = fetchMock.getSpy();
      const callArgs = spy.mock.calls[0];
      const options = callArgs?.[1] as RequestInit;
      const headers = new Headers(options?.headers);

      expect(headers.get('Accept')).toBe('application/vnd.github.v3+json');
      expect(headers.get('User-Agent')).toBe('dotfiles-generator');
    });

    test('includes auth token when provided', async () => {
      const clientWithAuth = new GitHubHttpClient({
        baseHttpClient: baseClient,
        logger,
        authToken: 'test-token-123',
      });

      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      await clientWithAuth.getLatestRelease('owner', 'repo');

      const spy = fetchMock.getSpy();
      const callArgs = spy.mock.calls[0];
      const options = callArgs?.[1] as RequestInit;
      const headers = new Headers(options?.headers);

      expect(headers.get('Authorization')).toBe('Bearer test-token-123');
    });

    test('throws GITHUB_RELEASE_NOT_FOUND on 404', async () => {
      fetchMock.mockResponseOnce({ status: 404, statusText: 'Not Found' });

      try {
        await githubClient.getLatestRelease('owner', 'nonexistent-repo');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpPipelineError);
        const httpError = error as HttpPipelineError;
        expect(httpError.errorCode).toBe('GITHUB_RELEASE_NOT_FOUND');
        expect(httpError.kind).toBe('http_client_4xx');
      }
    });

    test('throws GITHUB_RATE_LIMIT_EXCEEDED on 403', async () => {
      fetchMock.mockResponseOnce({
        status: 403,
        statusText: 'Forbidden',
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1234567890',
        },
      });

      try {
        await githubClient.getLatestRelease('owner', 'repo');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpPipelineError);
        const httpError = error as HttpPipelineError;
        expect(httpError.errorCode).toBe('GITHUB_RATE_LIMIT_EXCEEDED');
        expect(httpError.kind).toBe('rate_limit');
      }
    });

    test('throws GITHUB_INVALID_RELEASE_SCHEMA on invalid response', async () => {
      fetchMock.mockJsonResponseOnce({ invalid: 'data' });

      try {
        await githubClient.getLatestRelease('owner', 'repo');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpPipelineError);
        const httpError = error as HttpPipelineError;
        expect(httpError.errorCode).toBe('GITHUB_INVALID_RELEASE_SCHEMA');
        expect(httpError.kind).toBe('schema');
      }
    });

    test('caches release data', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      await githubClient.getLatestRelease('owner', 'repo');
      await githubClient.getLatestRelease('owner', 'repo');

      const spy = fetchMock.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getReleaseByTag', () => {
    test('fetches release by tag successfully', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      const release = await githubClient.getReleaseByTag('owner', 'repo', 'v25.5.31');

      expect(release.tag_name).toBe('v25.5.31');
    });

    test('uses correct GitHub API URL with tag', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      await githubClient.getReleaseByTag('owner', 'repo', 'v1.5.0');

      const spy = fetchMock.getSpy();
      const callArgs = spy.mock.calls[0];
      expect(callArgs?.[0]).toBe('https://api.github.com/repos/owner/repo/releases/tags/v1.5.0');
    });

    test('throws GITHUB_RELEASE_NOT_FOUND when tag does not exist', async () => {
      fetchMock.mockResponseOnce({ status: 404 });

      try {
        await githubClient.getReleaseByTag('owner', 'repo', 'v99.99.99');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpPipelineError);
        const httpError = error as HttpPipelineError;
        expect(httpError.errorCode).toBe('GITHUB_RELEASE_NOT_FOUND');
      }
    });

    test('caches release data by tag', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RELEASE);

      await githubClient.getReleaseByTag('owner', 'repo', 'v1.0.0');
      await githubClient.getReleaseByTag('owner', 'repo', 'v1.0.0');

      const spy = fetchMock.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRateLimit', () => {
    test('fetches rate limit successfully', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RATE_LIMIT);

      const rateLimit = await githubClient.getRateLimit();

      expect(rateLimit.resources.core.limit).toBe(60);
      expect(rateLimit.resources.core.remaining).toBe(49);
      expect(rateLimit.resources.core.reset).toBe(1748974715);
    });

    test('uses correct GitHub API URL', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RATE_LIMIT);

      await githubClient.getRateLimit();

      const spy = fetchMock.getSpy();
      const callArgs = spy.mock.calls[0];
      expect(callArgs?.[0]).toBe('https://api.github.com/rate_limit');
    });

    test('caches rate limit with short TTL', async () => {
      fetchMock.mockJsonResponseOnce(MOCK_RATE_LIMIT);

      await githubClient.getRateLimit();
      await githubClient.getRateLimit();

      const spy = fetchMock.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
