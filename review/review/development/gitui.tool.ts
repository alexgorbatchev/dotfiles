import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'extrawurst/gitui',
  })
    .bin('gitui')
    .zsh((shell) =>
      shell.aliases({
        gu: 'gitui',
      })
    )
);
