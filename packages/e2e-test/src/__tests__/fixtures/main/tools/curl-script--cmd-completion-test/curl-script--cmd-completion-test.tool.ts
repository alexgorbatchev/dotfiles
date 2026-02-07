import { defineTool } from '@dotfiles/cli';

const mockServerHost = process.env['MOCK_SERVER_PORT']
  ? `http://127.0.0.1:${process.env['MOCK_SERVER_PORT']}`
  : 'http://127.0.0.1:8765';

export default defineTool((install) =>
  install('curl-script', {
    url: `${mockServerHost}/mock-install-for-cmd-completion-test.sh`,
    shell: 'bash',
    env: (ctx) => ({ INSTALL_DIR: ctx.stagingDir }),
  })
    .bin('curl-script--cmd-completion-test')
    .version('latest')
    .zsh((shell) =>
      shell.completions({
        cmd: 'curl-script--cmd-completion-test completions zsh',
      })
    )
    .bash((shell) =>
      shell.completions({
        cmd: 'curl-script--cmd-completion-test completions bash',
      })
    )
);
