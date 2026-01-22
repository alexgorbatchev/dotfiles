import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install('brew', {
      formula: 'aerospace',
      cask: true,
      tap: 'nikitabobko/tap',
    }).symlink('aerospace.toml', '~/.config/aerospace/aerospace.toml'))
);
