/**
 * @file generator/src/modules/github-client/__tests__/fixtures/cacheTestFixtures.ts
 * @description Test fixtures for GitHub API cache tests
 */

import type { GitHubRelease, GitHubReleaseAsset } from '@types';

/**
 * Mock GitHub release asset
 */
export const FIXTURE_RELEASE_ASSET: GitHubReleaseAsset = {
  name: 'test-asset-v1.0.0-darwin-amd64.tar.gz',
  browser_download_url: 'https://example.com/download/test-asset-v1.0.0-darwin-amd64.tar.gz',
  size: 1024,
  content_type: 'application/gzip',
  state: 'uploaded',
  download_count: 42,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/**
 * Mock GitHub release
 */
export const FIXTURE_RELEASE: GitHubRelease = {
  id: 12345,
  tag_name: 'v1.0.0',
  name: 'Release v1.0.0',
  draft: false,
  prerelease: false,
  created_at: '2025-01-01T00:00:00Z',
  published_at: '2025-01-01T00:00:00Z',
  assets: [FIXTURE_RELEASE_ASSET],
  body: 'Test release notes',
  html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0',
};

/**
 * Mock GitHub release with prerelease flag set to true
 */
export const FIXTURE_PRERELEASE: GitHubRelease = {
  id: 12346,
  tag_name: 'v1.1.0-beta.1',
  name: 'Beta Release v1.1.0-beta.1',
  draft: false,
  prerelease: true,
  created_at: '2025-01-15T00:00:00Z',
  published_at: '2025-01-15T00:00:00Z',
  assets: [
    {
      ...FIXTURE_RELEASE_ASSET,
      name: 'test-asset-v1.1.0-beta.1-darwin-amd64.tar.gz',
      browser_download_url:
        'https://example.com/download/test-asset-v1.1.0-beta.1-darwin-amd64.tar.gz',
    },
  ],
  body: 'Beta release notes',
  html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.1.0-beta.1',
};

/**
 * Mock GitHub releases list
 */
export const FIXTURE_RELEASES_LIST: GitHubRelease[] = [
  FIXTURE_RELEASE,
  FIXTURE_PRERELEASE,
  {
    id: 12347,
    tag_name: 'v0.9.0',
    name: 'Release v0.9.0',
    draft: false,
    prerelease: false,
    created_at: '2024-12-01T00:00:00Z',
    published_at: '2024-12-01T00:00:00Z',
    assets: [
      {
        ...FIXTURE_RELEASE_ASSET,
        name: 'test-asset-v0.9.0-darwin-amd64.tar.gz',
        browser_download_url: 'https://example.com/download/test-asset-v0.9.0-darwin-amd64.tar.gz',
      },
    ],
    body: 'Previous release notes',
    html_url: 'https://github.com/test-owner/test-repo/releases/tag/v0.9.0',
  },
];
