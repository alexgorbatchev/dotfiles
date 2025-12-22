import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-tar', {
    url: 'http://127.0.0.1:8765/mock-install-version-detection-curl-tar-with-args.tar.gz',
    versionArgs: ['--version'],
    versionRegex: 'version-detection--curl-tar--with-args (\\d+\\.\\d+\\.\\d+)',
    env: {
      INSTALL_DIR: '{installDir}',
    },
  })
    .version('latest')
    .bin('version-detection--curl-tar--with-args');
});
