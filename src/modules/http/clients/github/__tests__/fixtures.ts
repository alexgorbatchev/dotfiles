import type { GitHubRateLimit, GitHubRelease } from '../schemas';

export const FIXTURE_GITHUB_RELEASE: GitHubRelease = {
  id: 123456,
  tag_name: 'v1.2.3',
  name: 'Release v1.2.3',
  draft: false,
  prerelease: false,
  created_at: '2024-01-01T00:00:00Z',
  published_at: '2024-01-01T00:00:00Z',
  tarball_url: 'https://api.github.com/repos/owner/repo/tarball/v1.2.3',
  zipball_url: 'https://api.github.com/repos/owner/repo/zipball/v1.2.3',
  body: 'Release notes for v1.2.3',
  html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
  url: 'https://api.github.com/repos/owner/repo/releases/123456',
  assets: [
    {
      id: 1,
      name: 'binary-linux-amd64',
      label: 'Linux AMD64 Binary',
      browser_download_url: 'https://github.com/owner/repo/releases/download/v1.2.3/binary-linux-amd64',
      size: 1024000,
      content_type: 'application/octet-stream',
      state: 'uploaded',
      download_count: 42,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      url: 'https://api.github.com/repos/owner/repo/releases/assets/1',
    },
    {
      id: 2,
      name: 'binary-darwin-amd64',
      label: 'macOS AMD64 Binary',
      browser_download_url: 'https://github.com/owner/repo/releases/download/v1.2.3/binary-darwin-amd64',
      size: 2048000,
      content_type: 'application/octet-stream',
      state: 'uploaded',
      download_count: 15,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      url: 'https://api.github.com/repos/owner/repo/releases/assets/2',
    },
  ],
};

export const FIXTURE_GITHUB_RATE_LIMIT: GitHubRateLimit = {
  resources: {
    core: {
      limit: 5000,
      remaining: 4999,
      reset: 1234567890,
      used: 1,
    },
    search: {
      limit: 30,
      remaining: 30,
      reset: 1234567890,
      used: 0,
    },
    graphql: {
      limit: 5000,
      remaining: 5000,
      reset: 1234567890,
      used: 0,
    },
  },
  rate: {
    limit: 5000,
    remaining: 4999,
    reset: 1234567890,
    used: 1,
  },
};

export const FIXTURE_GITHUB_RELEASE_MINIMAL: GitHubRelease = {
  id: 789,
  tag_name: 'v2.0.0',
  name: null,
  draft: false,
  prerelease: true,
  created_at: '2024-02-01T00:00:00Z',
  published_at: null,
  tarball_url: null,
  zipball_url: null,
  body: null,
  html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
  url: 'https://api.github.com/repos/owner/repo/releases/789',
  assets: [],
};
