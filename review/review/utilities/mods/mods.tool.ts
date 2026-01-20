import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'charmbracelet/mods',
  })
    .bin('mods', '*/mods')
    .symlink('config.yaml', '~/.config/mods/mods.yml')
    .zsh((shell) =>
      shell.aliases({
        mods: 'mods --model gpt-4o-mini --no-cache',
      })
    )
);
