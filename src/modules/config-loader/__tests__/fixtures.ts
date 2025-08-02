import type { YamlConfig } from '@modules/config';

export const MOCK_DEFAULT_CONFIG_OBJ: YamlConfig = {
  userConfigPath: '',
  paths: {
    homeDir: '/home/testuser',
    dotfilesDir: '${paths.homeDir}/.dotfiles',
    targetDir: '/usr/local/bin',
    generatedDir: '${paths.dotfilesDir}/.generated',
    toolConfigsDir: '${paths.dotfilesDir}/generator/configs/tools',
    completionsDir: '${paths.generatedDir}/completions',
    manifestPath: '${paths.generatedDir}/generated-manifest.json',
    binariesDir: '${paths.generatedDir}/bin',
  },
  system: {
    sudoPrompt: 'Enter password for generator:',
  },
  logging: {
    debug: '',
  },
  updates: {
    checkOnRun: true,
    checkInterval: 86400,
  },
  github: {
    token: '${GITHUB_TOKEN}',
    host: 'https://api.github.com',
    userAgent: 'dotfiles-generator',
    cache: {
      enabled: true,
      ttl: 86400000,
    },
  },
  downloader: {
    timeout: 300000,
    retryCount: 3,
    retryDelay: 1000,
    cache: {
      enabled: true,
      ttl: 86400000,
    },
  },
};
