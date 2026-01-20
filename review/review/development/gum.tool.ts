import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'charmbracelet/gum',
  })
    .bin('gum')
    .zsh((shell) => shell.completions('completions/gum.zsh'))
);
