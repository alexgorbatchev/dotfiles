import { defineTool, Platform } from '../../packages/cli';

export default defineTool((install, _ctx) =>
  install()
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
