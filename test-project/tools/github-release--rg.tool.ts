import { defineTool } from '@dotfiles/cli';

export default defineTool((install, _ctx) =>
  install('github-release', { repo: 'BurntSushi/ripgrep' })
    .bin('rg')
    .zsh((shell) =>
      shell.completions({
        url: 'https://raw.githubusercontent.com/BurntSushi/ripgrep/master/crates/core/flags/complete/rg.zsh',
        bin: 'rg',
      })
    )
);
