import { defineTool } from '@gitea/dotfiles';

export default defineTool((install, _ctx) =>
  install('github-release', {
    repo: 'neovim/neovim',
    assetPattern: '*.tar.gz',
  })
    .bin('nvim', 'nvim-*/bin/nvim')
    .symlink('lazyvim', '~/.config/nvim')
    .hook('after-install', async ({ $ }) => {
      // Set VIMRUNTIME environment variable
      await $`export VIMRUNTIME="$(dirname $(which nvim))/../share/nvim/runtime"`;
    })
    .zsh((shell) =>
      shell
        .aliases({
          v: 'nvim',
          vd: 'pushd ~/.dotfiles && nvim . && popd',
        })
        .always(/* zsh */ `
          function v-clean() {
            local all="$1"

            rm -fr ~/.config/nvim
            echo "Removed NVIM config"

            if [[ "$all" == "--all" ]]; then
              rm -fr ~/.local/share/nvim
              rm -fr ~/.local/state/nvim
              rm -fr ~/.cache/nvim

              echo "Removed NVIM and all data"
            else
              echo "Use --all flag to remove all NVIM data"
            fi

            echo "Done"
          }
        `)
    )
);
