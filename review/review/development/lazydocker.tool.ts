import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'jesseduffield/lazydocker',
  })
    .bin('lazydocker')
    .zsh((shell) =>
      shell.aliases({
        ld: 'lazydocker',
      })
    )
);
