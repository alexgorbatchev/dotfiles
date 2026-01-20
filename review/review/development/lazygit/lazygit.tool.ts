import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'jesseduffield/lazygit',
  })
    .bin('lazygit')
    .symlink('./config.yml', '~/.config/lazygit/config.yml')
    .zsh((shell) =>
      shell.aliases({
        g: 'lazygit',
      })
    )
);
