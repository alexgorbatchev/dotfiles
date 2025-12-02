import { defineTool } from '@dotfiles/cli';

export default defineTool((install) =>
  install('curl-script', {
    url: 'http://localhost:8765/mock-install-for-cmd-completion-test.sh',
    shell: 'bash',
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
