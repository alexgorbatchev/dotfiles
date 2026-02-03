import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'zellij-org/zellij',
  })
    .bin('zellij')
    .symlink('config.kdl', '~/.config/zellij/config.kdl')
    .zsh((shell) =>
      shell
        .env({
          ZELLIJ_CONFIG_DIR: `${ctx.toolDir}`,
        })
        .aliases({
          zl: `zellij --config-dir "${ctx.toolDir}"`,
        })
    )
);
