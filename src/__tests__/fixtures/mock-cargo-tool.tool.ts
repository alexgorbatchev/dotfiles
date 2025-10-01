import type { ToolConfigBuilder, ToolConfigContext } from '@types';

export default async (c: ToolConfigBuilder, _ctx: ToolConfigContext): Promise<void> => {
  c.bin('mock-cargo-tool').version('1.0.0').install('cargo', {
    crateName: 'mock-cargo-tool',
    binarySource: 'cargo-quickinstall',
    versionSource: 'cargo-toml',
    githubRepo: 'mock-owner/mock-cargo-tool',
  });
};
