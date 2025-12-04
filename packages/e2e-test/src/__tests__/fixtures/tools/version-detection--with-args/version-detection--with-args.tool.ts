import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-script', {
    url: 'http://localhost:8765/mock-install-version-detection-with-args.sh',
    shell: 'sh',
    versionArgs: ['--version'],
    versionRegex: 'version-detection--with-args (\\d+\\.\\d+\\.\\d+)',
    env: {
      INSTALL_DIR: '{installDir}',
    },
  })
    .version('latest')
    .bin('version-detection--with-args');
});
