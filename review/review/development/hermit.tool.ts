import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'cashapp/hermit',
  })
    .bin('hermit')
    .zsh((shell) =>
      shell
        .environment({
          HERMIT_ROOT_BIN: '~/bin/hermit',
        })
        .always(/* zsh */ `
          # Initialize Hermit shell hooks
          eval "$(test -x $HERMIT_ROOT_BIN && $HERMIT_ROOT_BIN shell-hooks --print --zsh)"
        `)
    )
);
