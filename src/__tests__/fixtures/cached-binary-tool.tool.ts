import { type GithubReleaseToolConfig } from '@types';

const config: GithubReleaseToolConfig = {
  name: 'cached-binary-tool',
  binaries: ['cached-binary-tool'],
  version: '1.0.0',
  installationMethod: 'github-release',
  installParams: {
    repo: 'mock-owner/cached-binary-repo',
    assetPattern: 'cached-binary-tool-v1.0.0-linux-amd64',
  },
};

export default config;