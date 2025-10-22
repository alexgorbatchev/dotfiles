import type { ToolConfig } from '@dotfiles/schemas';

const config: ToolConfig = {
  name: 'mock-tool',
  binaries: ['mock-tool'],
  version: '1.0.0',
  installationMethod: 'manual',
  installParams: {
    binaryPath: '/usr/local/bin/mock-tool', // Provide a mock binary path
  },
};

export default config;
