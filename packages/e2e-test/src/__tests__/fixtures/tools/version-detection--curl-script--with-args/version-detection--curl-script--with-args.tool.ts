import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-script', {
    url: 'http://localhost:8765/mock-install-version-detection-curl-script-with-args.sh',
    shell: 'sh',
    versionArgs: ['--version'],
    versionRegex: 'version-detection--curl-script--with-args (\\d+\\.\\d+\\.\\d+)',
    env: {
      INSTALL_DIR: '{installDir}',
    },
  })
    .version('latest')
    .bin('version-detection--curl-script--with-args');
});
