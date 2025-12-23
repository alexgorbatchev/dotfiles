import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-script', {
    url: 'http://127.0.0.1:8765/mock-install-version-detection-curl-script-default-args.sh',
    shell: 'sh',
    env: {
      INSTALL_DIR: '{stagingDir}',
    },
  }).bin('version-detection--curl-script--default-args');
});
