import type { YamlConfig } from '@dotfiles/config';

export function createMockYamlConfigWithPathsOnly(): YamlConfig {
  return {
    paths: {
      homeDir: '/home/test',
      dotfilesDir: '/home/test/.dotfiles',
      generatedDir: '/home/test/.dotfiles/.generated',
      shellScriptsDir: '/home/test/.dotfiles/.generated/shell-scripts',
      binariesDir: '/home/test/.dotfiles/.generated/bin',
      targetDir: '/usr/local/bin',
      toolConfigsDir: '/home/test/.dotfiles/configs/tools',
    },
  } as YamlConfig;
}
