import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'yorukot/superfile',
  })
    .bin('spf', '**/spf')
    .zsh((shell) =>
      shell
        .aliases({
          s: 'spf-cd-on-quit',
        })
        .functions({
          'spf-cd-on-quit': /* zsh */ `
            local os=$(uname -s)

            # Linux
            if [[ "$os" == "Linux" ]]; then
              export SPF_LAST_DIR="\${XDG_STATE_HOME:-$HOME/.local/state}/superfile/lastdir"
            fi

            # macOS
            if [[ "$os" == "Darwin" ]]; then
              export SPF_LAST_DIR="$HOME/Library/Application Support/superfile/lastdir"
            fi

            spf "$@"

            [ ! -f "$SPF_LAST_DIR" ] || {
              . "$SPF_LAST_DIR"
              rm -f -- "$SPF_LAST_DIR" >/dev/null
            }
          `,
        })
    )
);
