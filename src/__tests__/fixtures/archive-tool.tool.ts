import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
  c
    .bin('archive-tool')
    .version('1.0.0')
    .install('github-release', {
      repo: 'mock-owner/archive-repo',
      assetPattern: 'archive-tool-v1.0.0-linux-amd64.tar.gz',
      binaryPath: 'archive-tool',
    });
};