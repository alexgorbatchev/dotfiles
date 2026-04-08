import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install().symlink('./config.txt', '~/.config/renameable-tool/config.txt')
);
