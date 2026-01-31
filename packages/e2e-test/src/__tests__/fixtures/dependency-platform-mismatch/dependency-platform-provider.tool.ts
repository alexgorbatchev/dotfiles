import { defineTool } from '@dotfiles/cli';
import { Platform } from '@dotfiles/core';

export default defineTool((install) =>
  install()
    .version('1.0.0')
    .platform(Platform.MacOS, (platformInstall) => platformInstall('manual', {}).bin('platform-specific-binary'))
);
