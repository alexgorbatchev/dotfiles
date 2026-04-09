import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install()
    .symlink('./my-config.yml', '~/.config/symlink-tool/config.yml')
);
