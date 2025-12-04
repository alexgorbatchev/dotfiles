import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-script', {
    url: 'http://localhost:8765/mock-install-version-detection-no-version.sh',
    shell: 'sh',
    env: {
      INSTALL_DIR: '{installDir}',
    },
  }).bin('version-detection--no-version');
});
