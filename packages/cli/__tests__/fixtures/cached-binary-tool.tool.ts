import type { ToolConfigBuilder, ToolConfigContext } from '@dotfiles/schemas';

export default async (c: ToolConfigBuilder, _ctx: ToolConfigContext): Promise<void> => {
  c.bin('cached-binary-tool').version('1.0.0').install('github-release', {
    repo: 'mock-owner/cached-binary-repo',
    assetPattern: 'cached-binary-tool-v1.0.0-linux-amd64',
  });
};
