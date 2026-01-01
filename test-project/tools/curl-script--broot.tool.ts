import { defineTool, Platform } from '@dotfiles/cli';

export default defineTool((install) =>
  install()
    .disable()
    .bin('broot')
    .dependsOn('blah')
    .platform(Platform.MacOS, (install) =>
      install('curl-tar', { url: 'https://dystroy.org/broot/download/aarch64-apple-darwin/broot' })
    )
);
