import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, ctx) =>
  install('github-release', {
    repo: 'atuinsh/atuin',
    assetPattern: 'atuin-*.tar.gz',
  })
    .bin('atuin', 'atuin*/atuin')
    .symlink('./config.toml', '~/.config/atuin/config.toml')
    .hook('after-install', async ({ $ }) => {
      await $`atuin init zsh > ${ctx.toolDir}/atuin-init.zsh`;
    })
    .zsh((shell) =>
      shell
        .environment({ ATUIN_CONFIG_DIR: ctx.toolDir })
        .completions({ cmd: 'atuin gen-completions --shell zsh' })
        .source('./atuin-init.zsh')
    )
);
