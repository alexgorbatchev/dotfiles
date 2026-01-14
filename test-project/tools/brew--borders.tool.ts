import { defineTool, Platform } from '../../packages/cli';

export default defineTool((install, _ctx) =>
  install()
    .bin('borders')
    .platform(
      Platform.MacOS,
      (install) =>
        install('brew', {
          formula: 'borders',
          tap: 'FelixKratz/formulae',
        })
          .bin('borders'),
    )
);
