// Mock data representing the GitHub API response for releases
// Based on https://api.github.com/repos/eza-community/eza/releases
// and conforming to the Zod schemas in github-api.ts

import type {
  GitHubUser,
  GitHubRelease,
  GitHubReleaseAsset,
  GitHubReactions,
} from '../../src/utils/github-api';

const mockUser: GitHubUser = {
  login: 'mockuser',
  id: 12345,
  node_id: 'MDQ6VXNlcjEyMzQ1',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
  gravatar_id: '',
  url: 'https://api.github.com/users/mockuser',
  html_url: 'https://github.com/mockuser',
  followers_url: 'https://api.github.com/users/mockuser/followers',
  following_url: 'https://api.github.com/users/mockuser/following{/other_user}',
  gists_url: 'https://api.github.com/users/mockuser/gists{/gist_id}',
  starred_url: 'https://api.github.com/users/mockuser/starred{/owner}{/repo}',
  subscriptions_url: 'https://api.github.com/users/mockuser/subscriptions',
  organizations_url: 'https://api.github.com/users/mockuser/orgs',
  repos_url: 'https://api.github.com/users/mockuser/repos',
  events_url: 'https://api.github.com/users/mockuser/events{/privacy}',
  received_events_url: 'https://api.github.com/users/mockuser/received_events',
  type: 'User',
  site_admin: false,
};

const mockReactions: GitHubReactions = {
  url: 'https://api.github.com/repos/eza-community/eza/releases/123456789/reactions',
  total_count: 5,
  '+1': 1,
  '-1': 0,
  laugh: 1,
  hooray: 1,
  confused: 0,
  heart: 1,
  rocket: 1,
  eyes: 0,
};

const mockAssetBase = {
  id: 987654321,
  node_id: 'RA_kwDOKAtYXM4O-XYZ', // Example node_id
  label: null,
  uploader: mockUser,
  content_type: 'application/octet-stream',
  state: 'uploaded',
  size: 1000000,
  download_count: 100,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const FIXTURE_GITHUB_API_LATEST_RELEASE_EZA: GitHubRelease = {
  url: 'https://api.github.com/repos/eza-community/eza/releases/123456789',
  assets_url: 'https://api.github.com/repos/eza-community/eza/releases/123456789/assets',
  upload_url:
    'https://uploads.github.com/repos/eza-community/eza/releases/123456789/assets{?name,label}',
  html_url: 'https://github.com/eza-community/eza/releases/tag/v0.18.0',
  id: 123456789,
  author: mockUser,
  node_id: 'RE_kwDOKAtYXM4ABCDE', // Example node_id
  tag_name: 'v0.18.0',
  target_commitish: 'main',
  name: 'v0.18.0',
  draft: false,
  prerelease: false,
  created_at: '2024-01-01T00:00:00Z',
  published_at: '2024-01-01T00:00:00Z',
  assets: [
    {
      ...mockAssetBase,
      url: 'https://api.github.com/repos/eza-community/eza/releases/assets/987654321',
      id: 987654321,
      name: 'eza-aarch64-apple-darwin.tar.gz',
      browser_download_url:
        'https://github.com/eza-community/eza/releases/download/v0.18.0/eza-aarch64-apple-darwin.tar.gz',
    },
    {
      ...mockAssetBase,
      url: 'https://api.github.com/repos/eza-community/eza/releases/assets/987654322',
      id: 987654322,
      name: 'eza-x86_64-apple-darwin.tar.gz',
      browser_download_url:
        'https://github.com/eza-community/eza/releases/download/v0.18.0/eza-x86_64-apple-darwin.tar.gz',
    },
    {
      ...mockAssetBase,
      url: 'https://api.github.com/repos/eza-community/eza/releases/assets/987654323',
      id: 987654323,
      name: 'eza-x86_64-unknown-linux-gnu.tar.gz',
      browser_download_url:
        'https://github.com/eza-community/eza/releases/download/v0.18.0/eza-x86_64-unknown-linux-gnu.tar.gz',
    },
    {
      ...mockAssetBase,
      url: 'https://api.github.com/repos/eza-community/eza/releases/assets/987654324',
      id: 987654324,
      name: 'eza-aarch64-unknown-linux-gnu.tar.gz',
      browser_download_url:
        'https://github.com/eza-community/eza/releases/download/v0.18.0/eza-aarch64-unknown-linux-gnu.tar.gz',
    },
  ],
  tarball_url: 'https://api.github.com/repos/eza-community/eza/tarball/v0.18.0',
  zipball_url: 'https://api.github.com/repos/eza-community/eza/zipball/v0.18.0',
  body: 'This is the release body for v0.18.0.',
  reactions: mockReactions,
};

export const FIXTURE_GITHUB_API_RELEASES_EZA: GitHubRelease[] = [
  FIXTURE_GITHUB_API_LATEST_RELEASE_EZA,
  {
    url: 'https://api.github.com/repos/eza-community/eza/releases/123456788',
    assets_url: 'https://api.github.com/repos/eza-community/eza/releases/123456788/assets',
    upload_url:
      'https://uploads.github.com/repos/eza-community/eza/releases/123456788/assets{?name,label}',
    html_url: 'https://github.com/eza-community/eza/releases/tag/v0.17.0',
    id: 123456788,
    author: mockUser,
    node_id: 'RE_kwDOKAtYXM4FEDCB', // Example node_id
    tag_name: 'v0.17.0',
    target_commitish: 'main',
    name: 'v0.17.0',
    draft: false,
    prerelease: false,
    created_at: '2023-12-01T00:00:00Z',
    published_at: '2023-12-01T00:00:00Z',
    assets: [
      {
        ...mockAssetBase,
        url: 'https://api.github.com/repos/eza-community/eza/releases/assets/987654311',
        id: 987654311,
        name: 'eza-aarch64-apple-darwin.tar.gz',
        browser_download_url:
          'https://github.com/eza-community/eza/releases/download/v0.17.0/eza-aarch64-apple-darwin.tar.gz',
        created_at: '2023-12-01T00:00:00Z',
        updated_at: '2023-12-01T00:00:00Z',
      },
    ],
    tarball_url: 'https://api.github.com/repos/eza-community/eza/tarball/v0.17.0',
    zipball_url: 'https://api.github.com/repos/eza-community/eza/zipball/v0.17.0',
    body: 'This is the release body for v0.17.0.',
    reactions: {
      ...mockReactions,
      url: 'https://api.github.com/repos/eza-community/eza/releases/123456788/reactions',
    },
  },
];
