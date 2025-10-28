import type { YamlConfig } from '@dotfiles/schemas/config';

export const MOCK_DEFAULT_CONFIG_OBJ: YamlConfig = {
  configFilePath: '',
  configFileDir: '',

  paths: {
    homeDir: '/home/testuser',
    dotfilesDir: `\${paths.homeDir}/.dotfiles`,
    targetDir: '/usr/local/bin',
    generatedDir: `\${paths.dotfilesDir}/.generated`,
    toolConfigsDir: `\${paths.dotfilesDir}/tools`,
    shellScriptsDir: `\${paths.generatedDir}/shell-scripts`,
    binariesDir: `\${paths.generatedDir}/bin`,
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
    token: `\${GITHUB_TOKEN}`,
    host: 'https://api.github.com',
    userAgent: 'dotfiles-generator',
    cache: {
      enabled: true,
      ttl: 86400000,
    },
  },
  cargo: {
    cratesIo: {
      host: 'https://crates.io',
      cache: { enabled: true, ttl: 86400000 },
      token: '',
      userAgent: 'dotfiles-generator',
    },
    githubRaw: {
      host: 'https://raw.githubusercontent.com',
      cache: { enabled: true, ttl: 86400000 },
      token: '',
      userAgent: 'dotfiles-generator',
    },
    githubRelease: {
      host: 'https://github.com',
      cache: { enabled: true, ttl: 86400000 },
      token: '',
      userAgent: 'dotfiles-generator',
    },
    userAgent: 'dotfiles-generator',
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
  features: {
    catalog: {
      generate: true,
      filePath: `\${paths.dotfilesDir}`,
    },
  },
};
