import { defineTool } from '@dotfiles/cli';

export default defineTool((install, _ctx) =>
  install('github-release', { repo: 'BurntSushi/ripgrep' })
    .bin('rg')
    .zsh((shell) => shell.completions('**/complete/_rg'))
);
