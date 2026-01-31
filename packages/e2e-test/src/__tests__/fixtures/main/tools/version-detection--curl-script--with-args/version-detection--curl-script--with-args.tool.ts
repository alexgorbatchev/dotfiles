import { defineTool } from '@dotfiles/cli';

export default defineTool((install) => {
  return install('curl-script', {
    url: 'http://127.0.0.1:8765/mock-install-version-detection-curl-script-with-args.sh',
    shell: 'sh',
    versionArgs: ['--version'],
    versionRegex: 'version-detection--curl-script--with-args (\\d+\\.\\d+\\.\\d+)',
    env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
  })
    .version('latest')
    .bin('version-detection--curl-script--with-args');
});
