/**
 * @fileoverview Mock tool configuration for direct binary GitHub release tests.
 */
import { type GithubReleaseToolConfig } from '@types';

const config: GithubReleaseToolConfig = {
  name: 'mock-direct-binary-tool',
  binaries: ['mock-direct-binary-tool'],
  version: '1.0.0',
  installationMethod: 'github-release',
  installParams: {
    repo: 'mock-owner/direct-binary-repo',
    assetPattern: 'mock-direct-binary-tool-v1.0.0-linux-amd64',
  },
};

export default config;