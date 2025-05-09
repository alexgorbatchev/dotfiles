import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import fetchMock from 'fetch-mock';
// Removed duplicate import line
import { GitHubApiClient, type GitHubRelease } from '../github-api'; // Import GitHubRelease type
import {
  FIXTURE_GITHUB_API_LATEST_RELEASE_EZA,
  FIXTURE_GITHUB_API_RELEASES_EZA,
} from '../../../__tests__/fixtures/github_api_releases_eza'; // Corrected relative path
import { config as appConfig, loadConfig } from '../../config'; // Import mutable config

// Mock config for testing - assuming tests run from .dotfiles/generator
const testDotfilesRoot = process.cwd();

describe('GitHubApiClient', () => {
  let client: GitHubApiClient;
  const repo = 'eza-community/eza';
  const tag = 'v0.17.0'; // A specific tag from the fixture

  beforeEach(() => {
    // Inject fetchMock's handler into the client
    // Need to cast fetchMock to FetchFunction type
    client = new GitHubApiClient(fetchMock.mockGlobal().fetchHandler as any);
  });

  afterEach(() => {
    fetchMock.hardReset();
    // Reset potential config modifications if necessary
    delete process.env.GITHUB_TOKEN;
  });

  it('should fetch the latest release', async () => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    // Use fetchMock
    fetchMock.get(url, FIXTURE_GITHUB_API_LATEST_RELEASE_EZA, { name: 'getLatestSuccess' });

    const release = await client.getLatestRelease(repo);

    expect(release).toBeDefined();
    expect(release.tag_name).toBe(FIXTURE_GITHUB_API_LATEST_RELEASE_EZA.tag_name);
    const lastCall = fetchMock.callHistory.lastCall(url);
    expect(lastCall).toBeDefined();
    if (lastCall) {
      expect(lastCall.url).toBe(url);
      expect(lastCall.options?.headers).toMatchObject({
        accept: 'application/vnd.github.v3+json',
        'user-agent': 'dotfiles-generator',
      });
    }
  });

  it('should fetch all releases', async () => {
    const url = `https://api.github.com/repos/${repo}/releases`;
    // Use fetchMock
    fetchMock.get(url, FIXTURE_GITHUB_API_RELEASES_EZA);

    const releases = await client.getReleases(repo);

    expect(releases).toBeDefined();
    expect(releases.length).toBe(FIXTURE_GITHUB_API_RELEASES_EZA.length);
    expect(releases[0].tag_name).toBe(FIXTURE_GITHUB_API_RELEASES_EZA[0].tag_name);
    expect(fetchMock.callHistory.called(url)).toBe(true);
  });

  it('should fetch a release by tag', async () => {
    const specificRelease = FIXTURE_GITHUB_API_RELEASES_EZA.find(
      (r: GitHubRelease) => r.tag_name === tag
    );
    expect(specificRelease).toBeDefined();
    if (!specificRelease) return;

    const url = `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
    // Use fetchMock
    fetchMock.get(url, specificRelease);

    const release = await client.getReleaseByTag(repo, tag);

    expect(release).toBeDefined();
    expect(release.tag_name).toBe(tag);
    const lastCall = fetchMock.callHistory.lastCall(url);
    expect(lastCall).toBeDefined();
    if (lastCall) {
      expect(lastCall.url).toBe(url);
    }
  });

  it('should include Authorization header if GITHUB_TOKEN is set in config', async () => {
    const token = 'test-github-token-123';
    process.env.GITHUB_TOKEN = token;
    Object.assign(appConfig, loadConfig(testDotfilesRoot));
    expect(appConfig.GITHUB_TOKEN).toBe(token);

    // Recreate client with injected fetchMock to pick up token
    const clientWithToken = new GitHubApiClient(fetchMock.fetchHandler as any);

    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    // Use fetchMock
    fetchMock.get(url, FIXTURE_GITHUB_API_LATEST_RELEASE_EZA, { name: 'getLatestAuthSuccess' });

    await clientWithToken.getLatestRelease(repo);

    const lastCall = fetchMock.callHistory.lastCall(url);
    expect(lastCall).toBeDefined();
    if (lastCall) {
      expect(lastCall.options?.headers).toMatchObject({
        authorization: `token ${token}`,
        accept: 'application/vnd.github.v3+json',
        'user-agent': 'dotfiles-generator',
      });
    }
  });

  it('should handle GitHub API errors', async () => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const errorMessage = 'Not Found Test Message';
    // Use fetchMock to simulate error
    fetchMock.get(
      url,
      {
        status: 404,
        body: JSON.stringify({ message: errorMessage }),
        headers: { 'Content-Type': 'application/json' },
      },
      { name: 'getLatestError404' } // Keep name
    );

    // Expect the client (using fetchMock) to throw the formatted error message
    // Assuming fetch-mock correctly sets ok=false and default statusText
    await expect(client.getLatestRelease(repo)).rejects.toThrow(
      `GitHub API error: 404 Not Found - ${errorMessage}`
    );
  });

  it('should handle rate limit exceeded errors (simplified)', async () => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const errorMessage = 'API rate limit exceeded Test Message';
    // Use fetchMock to simulate error with status/body
    fetchMock.get(
      url,
      {
        status: 403,
        body: JSON.stringify({ message: errorMessage }),
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
        },
      },
      { name: 'getLatestError403' } // Keep name
    );

    // Expect the client (using fetchMock) to throw the formatted error message
    // Assuming fetch-mock correctly sets ok=false and default statusText
    await expect(client.getLatestRelease(repo)).rejects.toThrow(
      'GitHub API error: 403 Forbidden - API rate limit exceeded Test Message'
    );
  });

  // TODO: Add tests for caching logic if implemented in GitHubApiClient
});
