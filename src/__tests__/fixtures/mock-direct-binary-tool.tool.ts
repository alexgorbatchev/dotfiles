import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, _ctx: ToolConfigContext): Promise<void> => {
  c.bin('mock-direct-binary-tool').version('1.0.0').install('github-release', {
    repo: 'mock-owner/direct-binary-repo',
    assetPattern: 'mock-direct-binary-tool-v1.0.0-linux-amd64',
  });
};
