import { type ToolConfig } from '../../types';

const config: ToolConfig = {
  name: 'mock-tool',
  binaries: ['mock-tool'],
  version: '1.0.0',
  installationMethod: 'manual',
  installParams: {
    // No params needed for manual installation
  },
};

export default config;
