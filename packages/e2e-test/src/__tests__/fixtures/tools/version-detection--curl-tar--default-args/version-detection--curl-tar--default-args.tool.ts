import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-tar', {
    url: 'http://127.0.0.1:8765/mock-install-version-detection-curl-tar-default-args.tar.gz',
    env: {
      INSTALL_DIR: '{installDir}',
    },
  }).bin('version-detection--curl-tar--default-args');
});
