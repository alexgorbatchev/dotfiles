alias v="nvim"
alias vd="pushd ~/.dotfiles && nvim . && popd"

alias-installer nvim

function v-clean() {
  local all="$1"

  rm -fr ~/.config/nvim
  echo "Removed NVIM config"

  if [[ "$all" == "--all" ]]; then
    rm -fr ~/.local/share/nvim
    rm -fr ~/.local/state/nvim
    rm -fr ~/.cache/nvim

    zinit delete neovim/neovim -y

    echo "Removed NVIM and all data"
  else
    echo "Use --all flag to remove all NVIM data"
  fi

  alias-installer nvim

  echo "Done"
}
