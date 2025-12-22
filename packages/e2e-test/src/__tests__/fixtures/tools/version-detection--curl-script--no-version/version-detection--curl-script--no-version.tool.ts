import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-script', {
    url: 'http://127.0.0.1:8765/mock-install-version-detection-curl-script-no-version.sh',
    shell: 'sh',
    env: {
      INSTALL_DIR: '{installDir}',
    },
  })
    .version('latest')
    .bin('version-detection--curl-script--no-version');
});
