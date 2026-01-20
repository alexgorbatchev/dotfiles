import { defineTool, Platform } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (install) =>
    install('brew', {
      formula: 'borders',
      tap: 'FelixKratz/formulae',
    })
      .bin('borders')
      .symlink('bordersrc', '~/.config/borders/bordersrc')
  )
);
