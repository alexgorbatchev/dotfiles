import type { YamlConfig } from '@modules/config';

export const MOCK_DEFAULT_CONFIG_OBJ: YamlConfig = {
  userConfigPath: '',
  paths: {
    homeDir: '/home/testuser',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Test string for variable expansion
    dotfilesDir: '${paths.homeDir}/.dotfiles',
    targetDir: '/usr/local/bin',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Test string for variable expansion
    generatedDir: '${paths.dotfilesDir}/.generated',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Test string for variable expansion
    toolConfigsDir: '${paths.dotfilesDir}/generator/configs/tools',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Test string for variable expansion
    shellScriptsDir: '${paths.generatedDir}/shell-scripts',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Test string for variable expansion
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
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Test string for variable expansion
    token: '${GITHUB_TOKEN}',
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
};
