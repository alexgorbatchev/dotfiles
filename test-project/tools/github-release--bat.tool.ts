import { defineTool } from '@dotfiles/cli';

export default defineTool((install, _ctx) =>
  install('github-release', { repo: 'sharkdp/bat' })
    .bin('bat')
    .zsh((shell, _shellCtx) => {
      // Use cmd to generate completions dynamically since bat supports it
      return shell.completions({
        cmd: 'bat --generate=completions zsh',
        bin: 'bat',
      });
    })
);
