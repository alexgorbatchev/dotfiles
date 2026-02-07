import { defineTool } from '@dotfiles/cli';

const mockServerHost = process.env['MOCK_SERVER_PORT']
  ? `http://127.0.0.1:${process.env['MOCK_SERVER_PORT']}`
  : 'http://127.0.0.1:8765';

export default defineTool((install) => {
  return install('curl-tar', {
    url: `${mockServerHost}/mock-install-version-detection-curl-tar-with-args.tar.gz`,
    versionArgs: ['--version'],
    versionRegex: 'version-detection--curl-tar--with-args (\\d+\\.\\d+\\.\\d+)',
    env: {
      INSTALL_DIR: '{stagingDir}',
    },
  })
    .version('latest')
    .bin('version-detection--curl-tar--with-args');
});
