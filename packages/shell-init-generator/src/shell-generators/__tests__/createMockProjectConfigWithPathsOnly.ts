import type { ProjectConfig } from '@dotfiles/config';

export function createMockProjectConfigWithPathsOnly(): ProjectConfig {
  return {
    paths: {
      homeDir: '/home/test',
      dotfilesDir: '/home/test/.dotfiles',
      generatedDir: '/home/test/.dotfiles/.generated',
      shellScriptsDir: '/home/test/.dotfiles/.generated/shell-scripts',
      binariesDir: '/home/test/.dotfiles/.generated/bin',
      targetDir: '/home/test/.local/bin',
      toolConfigsDir: '/home/test/.dotfiles/configs/tools',
    },
  } as ProjectConfig;
}
