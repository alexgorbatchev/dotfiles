import { type GithubReleaseToolConfig } from '@types';

const config: GithubReleaseToolConfig = {
  name: 'archive-tool',
  binaries: ['archive-tool'],
  version: '1.0.0',
  installationMethod: 'github-release',
  installParams: {
    repo: 'mock-owner/archive-repo',
    assetPattern: 'archive-tool-v1.0.0-linux-amd64.tar.gz',
    binaryPath: 'archive-tool',
  },
};

export default config;